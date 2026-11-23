/**
 * The vkma tunnel Vite plugin.
 *
 * `vkmaTunnel()` in the plugins list starts a tunnel for the dev server
 * (`configureServer`) and for `vite preview` (`configurePreviewServer`)
 * once the server actually listens, then prints its URL next to Vite's
 * own banner. The target port comes from the live server — no options
 * needed for the default setup.
 *
 * Vite >= 5.4.12 rejects unknown Host headers with 403, and it
 * SNAPSHOTS `allowedHosts` when it builds its servers (dev, preview and
 * the HMR WebSocket server each freeze a copy before `configureServer`
 * runs) — a hostname added later is invisible. Two things keep tunneled
 * requests flowing:
 *
 * - the core routes them through the host-rewriting proxy (`hostRewrite`,
 *   default on): the `*.localhost` alias is always allowed;
 * - the plugin registers the hostname of a STORED identity in the
 *   `config` hook, the last moment the list is mutable. A brand-new
 *   profile mints its hostname too late for that; with `hostRewrite:
 *   false` it then needs one restart (the plugin says so).
 *
 * Invariants:
 * - a fatal tunnel failure NEVER kills the dev server (tools must not
 *   take the app down, same policy as @vkma.dev/devtools) — including an
 *   invalid tunnel config, which is reported once the server is up;
 * - the plugin always tunnels the Vite server it is attached to: its
 *   `port`/`host` OPTIONS retarget it, the same keys in
 *   `vkma-tunnel.config.*` do not (they belong to the CLI and the Node
 *   API; a Vite plugin pointed elsewhere is never what was meant);
 * - the Vite root is the project: config discovery and the default
 *   profile start there, not at whatever directory Vite was launched
 *   from;
 * - a server restart reuses the stored identity (stable URL) and closes
 *   the previous connection first;
 * - the bridge closes BEFORE the process leaves, on every exit path. A
 *   hard kill skips the bridge close and leaves the service holding the
 *   route for a ghost session — the `route_conflict` takeover storm the
 *   next start has to fight through. Vite awaits the `closeServer` /
 *   `closePreviewServer` hooks (`q`, SIGTERM, stdin closing) but
 *   registers no SIGINT/SIGHUP handler: Ctrl+C or a closed terminal
 *   kills the process outright, so the plugin owns those two signals
 *   while a tunnel is live.
 */

import fs from "node:fs";
import path from "node:path";
import type { Plugin, UserConfig } from "vite";
import { rivalHint } from "./cli/conflict-hint.ts";
import { resolveTunnelConfig, type ResolveTunnelConfigResult } from "./config/resolve.ts";
import { readProfileRecord, tunnelDataDir } from "./core/identity.ts";
import { defaultProfile } from "./core/profile.ts";
import { createTunnel } from "./core/tunnel.ts";
import type { TunnelHandle, TunnelEvent } from "./core/types.ts";
import { cap, EXIT_CLOSE_CAP_MS, installExitGuard } from "./vite-exit.ts";
export interface VkmaTunnelPluginOptions {
	/** Set `false` to keep the plugin in the list inert (e.g. CI). Default `true`. */
	enabled?: boolean;
	/** Explicit config file path (skips discovery). */
	config?: string;
	provider?: string;
	/** Overrides the auto-detected server port. */
	port?: number;
	/** Overrides the default forward target host (`localhost`). */
	host?: string;
	/** Route name: `"@"` (apex, default) or a subdomain label. */
	route?: string;
	/** Identity profile; default: project directory name. */
	profile?: string;
	/** Self-hosted provider endpoint. */
	api?: string;
	/** Print a QR code of the tunnel URL (open it on a phone). Default `false`. */
	qr?: boolean;
	/** Open the tunnel URL in the desktop browser. Default `false`. */
	open?: boolean;
	/** Keep the bridge busy with a periodic self-probe (default `true`); see `createTunnel({ keepAlive })`. */
	keepAlive?: boolean;
	/**
	 * Rewrite the tunnel hostname to a same-length `*.localhost` alias in
	 * the forwarded requests (default `true`) — vite's allowedHosts check
	 * then passes without touching your config. Turn it off when your
	 * target genuinely needs the public Host header; Vite then accepts
	 * the tunnel host only because the plugin registered it in the
	 * `config` hook, which needs the profile's identity to already exist:
	 * a brand-new profile gets 403 until the next restart.
	 */
	hostRewrite?: boolean;
}

interface TunnelServerLike {
	httpServer: import("node:http").Server | null;
	config: {
		/** Resolved project root (absolute) — where config discovery starts. */
		root: string;
		server: { port?: number; allowedHosts?: string[] | true };
		preview: { port?: number; allowedHosts?: string[] | true };
	};
}

export function vkmaTunnel(options: VkmaTunnelPluginOptions = {}): Plugin[] {
	if (options.enabled === false) {
		return [];
	}
	return [vkmaTunnelPlugin(options)];
}

function vkmaTunnelPlugin(options: VkmaTunnelPluginOptions): Plugin {
	let handle: TunnelHandle | undefined;
	/** Removes the plugin's exit-signal listeners; set while a tunnel is live. */
	let releaseExitGuard: (() => void) | undefined;
	/** The tunnel close still in flight, if any — see `stop()`. */
	let closing: Promise<void> | undefined;
	/** Resolved tunnel configs by project root — one per root per plugin instance (Vite re-creates plugins on restart). */
	const resolved = new Map<string, Promise<ResolveTunnelConfigResult>>();
	/** The profile's hostname as the `config` hook found it — undefined for a brand-new profile. */
	let storedHostname: string | undefined;

	/** Resolves the tunnel config once per root; a rejection (invalid config) is reported by `startTunnel`. */
	const resolve = (root: string): Promise<ResolveTunnelConfigResult> => {
		let pending = resolved.get(root);
		if (pending === undefined) {
			pending = resolveTunnelConfig({
				cwd: root,
				configPath: options.config,
				overrides: {
					provider: options.provider,
					port: options.port,
					host: options.host,
					route: options.route,
					profile: options.profile,
					api: options.api,
				},
			});
			resolved.set(root, pending);
		}
		return pending;
	};

	/** The profile this run tunnels as — known long before any connection. */
	const profileOf = async (root: string): Promise<string> =>
		(await resolve(root)).config.profile ?? defaultProfile(root);

	/**
	 * Closes the active tunnel — never taking longer than EXIT_CLOSE_CAP_MS
	 * — and returns a promise for that close. While a close is in flight,
	 * every later call returns the SAME promise.
	 *
	 * That matters because Vite closes its HTTP server BEFORE it awaits
	 * the plugin hooks: the httpServer "close" event starts our close, and
	 * the hook that follows must wait for it instead of finding no handle,
	 * resolving at once and letting Vite's `process.exit()` cut the bridge
	 * close short. The exit guard awaits the same promise on a signal.
	 */
	const stop = (): Promise<void> => {
		const current = handle;
		handle = undefined;
		// No tunnel, no say in Ctrl+C: back to Vite's own (default) behaviour.
		releaseExitGuard?.();
		releaseExitGuard = undefined;
		if (current !== undefined) {
			closing = cap(
				current.close().catch(() => undefined),
				EXIT_CLOSE_CAP_MS,
			);
		}
		return closing ?? Promise.resolve();
	};

	return {
		name: "vkma-tunnel",
		async config(userConfig) {
			// Vite snapshots `allowedHosts` when it builds its servers, so
			// this hook is the last moment the list can grow. A stored
			// identity knows its hostname already: allow it here.
			const root = viteRoot(userConfig);
			try {
				const hostname = (await readProfileRecord(tunnelDataDir(), await profileOf(root)))
					?.hostname;
				if (hostname !== undefined) {
					allowInConfig(userConfig, hostname);
				}
				storedHostname = hostname;
			} catch {
				// An invalid tunnel config must not take Vite down; the same
				// (rejected) resolution surfaces as "failed to start" later.
			}
		},
		configureServer(server) {
			wireServer(server as unknown as TunnelServerLike, options, {
				setHandle: next => {
					// Restarts: the previous tunnel closes in the background
					// while the new one takes over.
					void stop();
					handle = next;
					releaseExitGuard = installExitGuard(stop);
				},
				close: () => void stop(),
				resolve,
				registeredHostname: () => storedHostname,
			});
		},
		configurePreviewServer(server) {
			wireServer(server as unknown as TunnelServerLike, options, {
				setHandle: next => {
					// Restarts: the previous tunnel closes in the background
					// while the new one takes over.
					void stop();
					handle = next;
					releaseExitGuard = installExitGuard(stop);
				},
				close: () => void stop(),
				resolve,
				registeredHostname: () => storedHostname,
				preview: true,
			});
		},
		// Vite awaits both hooks before it exits (`q`, SIGTERM, stdin
		// closing) — returning the promise is what makes the close graceful.
		closeServer() {
			return stop();
		},
		closePreviewServer() {
			return stop();
		},
	};
}

interface WireContext {
	/** Close the active tunnel, if any (restarts and server shutdown). */
	close(): void;
	setHandle(handle: TunnelHandle): void;
	/** The plugin instance's config resolution, memoized per project root. */
	resolve(root: string): Promise<ResolveTunnelConfigResult>;
	/** Hostname the `config` hook registered — undefined for a brand-new profile. */
	registeredHostname(): string | undefined;
	preview?: boolean;
}

function wireServer(
	server: TunnelServerLike,
	options: VkmaTunnelPluginOptions,
	context: WireContext,
): void {
	const httpServer = server.httpServer;
	if (httpServer === null) {
		// middlewareMode: no listening socket of our own to tunnel.
		serverLog("tunnel: skipped — Vite runs in middleware mode (no server to expose)");
		return;
	}

	const start = (): void => {
		void startTunnel(server, options, context);
	};
	if (httpServer.listening) {
		start();
	} else {
		httpServer.once("listening", start);
	}
	// The closeServer hook covers dev; preview server close also emits
	// httpServer "close" — close the tunnel on both paths.
	httpServer.on("close", () => {
		context.close();
	});
}

async function startTunnel(
	server: TunnelServerLike,
	options: VkmaTunnelPluginOptions,
	context: WireContext,
): Promise<void> {
	const preview = context.preview === true;
	const httpServer = server.httpServer;
	if (httpServer === null) {
		return;
	}

	// Actual listening address: honors port 0 (auto) and strict ports.
	const address = httpServer.address();
	const listeningPort =
		typeof address === "object" && address !== null ? address.port : undefined;
	const configuredPort = preview ? server.config.preview.port : server.config.server.port;
	const port = options.port ?? listeningPort ?? configuredPort ?? 5173;
	const host = options.host ?? "localhost";

	let tunnel: TunnelHandle;
	const root = server.config.root;
	try {
		const { config } = await context.resolve(root);
		let announced = false;
		let lastReason: string | undefined;
		let lastStage: string | undefined;
		let conflictHintShown = false;
		// Lifecycle events reach `onEvent` BEFORE `createTunnel` resolves —
		// the SDK delivers `route-conflict` while it is still attaching, which
		// is exactly when the hint matters. The handle does not exist yet, so
		// nothing inside `onEvent` may depend on it.
		const hintProfile = config.profile ?? defaultProfile(root);
		tunnel = await createTunnel({
			...config,
			cwd: root,
			port,
			host,
			keepAlive: options.keepAlive,
			hostRewrite: options.hostRewrite,
			pid: process.pid,
			onProgress: stage => {
				if (stage === lastStage || stage === "ready") {
					// "ready" ends provisioning; the banner follows moments later.
					return;
				}
				lastStage = stage;
				serverLog(`tunnel: ${stage}…`, "dim");
			},
			onEvent: event => {
				if (event.type === "disconnected") {
					lastReason = event.reason;
					return;
				}
				if (event.type === "route-conflict" && !conflictHintShown) {
					conflictHintShown = true;
					void readProfileRecord(tunnelDataDir(), hintProfile)
						.then(record => {
							const hint = rivalHint(record, process.pid);
							if (hint !== undefined) {
								serverLog(hint, "yellow");
							}
						})
						.catch(() => undefined);
				}
				// The first attach is announced by the URL banner itself.
				if (event.type === "connected" && !announced) {
					return;
				}
				renderPluginEvent(event, lastReason);
			},
		});
		announced = true;
	} catch (error) {
		serverLog(
			`tunnel: failed to start — ${error instanceof Error ? error.message : String(error)}`,
			"red",
		);
		return;
	}

	context.setHandle(tunnel);
	if (options.hostRewrite === false && context.registeredHostname() !== tunnel.hostname) {
		// Nothing rewrote the Host header and Vite's frozen allowedHosts
		// cannot learn this hostname any more — say why requests will 403.
		serverLog(
			`tunnel: host rewriting is off and "${tunnel.hostname}" only exists since this run — Vite snapshots allowedHosts at startup, so requests get 403 until the next restart`,
			"yellow",
		);
	}

	// eslint-disable-next-line no-console
	console.log(
		`  \x1b[32m➜\x1b[0m  \x1b[1mtunnel\x1b[0m  \x1b[2m→\x1b[0m  \x1b[36m${tunnel.primaryUrl}\x1b[0m  \x1b[2m(profile ${tunnel.profile} · ${host}:${String(port)}${preview ? " · preview" : ""})\x1b[0m`,
	);
	if (options.qr === true) {
		printPluginQr(tunnel.primaryUrl);
	}
	if (options.open === true) {
		void import("./cli/opener.ts").then(({ openUrl }) => openUrl(tunnel.primaryUrl));
	}

	tunnel.closed.catch(error => {
		serverLog(
			`tunnel: stopped — ${error instanceof Error ? error.message : String(error)}`,
			"red",
		);
	});
}

/** Renders plugin lifecycle lines (plain console, devtools-plugin style). */
function renderPluginEvent(event: TunnelEvent, reason?: string): void {
	switch (event.type) {
		case "route-conflict":
			serverLog(
				`tunnel: route held by another bridge (${event.routes.join(", ")}), taking over…`,
				"yellow",
			);
			break;
		case "reconnecting":
			serverLog(
				`tunnel: reconnecting (attempt ${String(event.attempt)}, in ${String(event.delayMs)}ms)${reason === undefined ? "" : ` — ${reason}`}`,
				"yellow",
			);
			break;
		case "connected":
			serverLog("tunnel: reconnected", "dim");
			break;
		case "stopped":
			if (event.error !== undefined) {
				serverLog(`tunnel: stopped — ${event.error}`, "red");
			}
			break;
		default:
			break;
	}
}

function printPluginQr(url: string): void {
	void import("./cli/qr.ts").then(({ renderQr }) => {
		console.log(renderQr(url));
	});
}

const ANSI: Record<string, string> = {
	red: "\x1b[31m",
	yellow: "\x1b[33m",
	dim: "\x1b[2m",
};

function serverLog(message: string, color?: "red" | "yellow" | "dim"): void {
	// eslint-disable-next-line no-console
	console.log(`  ${color === undefined ? "" : (ANSI[color] ?? "")}${message}\x1b[0m`);
}

/**
 * The project root as Vite is about to resolve it: `config.root` against
 * the working directory (the working directory itself when unset), with
 * symlinks resolved unless `resolve.preserveSymlinks` says otherwise —
 * the same value `server.config.root` carries later.
 */
function viteRoot(userConfig: UserConfig): string {
	const root = userConfig.root === undefined ? process.cwd() : path.resolve(userConfig.root);
	if (userConfig.resolve?.preserveSymlinks) {
		return root;
	}
	try {
		return fs.realpathSync.native(root);
	} catch {
		return root;
	}
}

/**
 * Allows `hostname` in a user config that Vite has not resolved yet (the
 * `config` hook). `preview.allowedHosts` inherits `server.allowedHosts`
 * unless the user wrote their own list, so only that explicit list is
 * extended — creating one would silently drop what preview inherited.
 */
function allowInConfig(userConfig: UserConfig, hostname: string): void {
	addAllowedHost((userConfig.server ??= {}), hostname);
	const preview = userConfig.preview;
	if (preview !== undefined && Array.isArray(preview.allowedHosts)) {
		addAllowedHost(preview, hostname);
	}
}

/** Pure mutation helper (unit-tested): keeps `allowedHosts` semantics intact. */
export function addAllowedHost(target: { allowedHosts?: string[] | true }, hostname: string): void {
	if (target.allowedHosts === true) {
		return;
	}
	const hosts = target.allowedHosts ?? (target.allowedHosts = []);
	if (!hosts.includes(hostname)) {
		hosts.push(hostname);
	}
}
