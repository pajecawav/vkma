/**
 * The vkma tunnel Vite plugin.
 *
 * `vkmaTunnel()` in the plugins list starts a tunnel for the dev server
 * (`configureServer`) and for `vite preview` (`configurePreviewServer`)
 * once the server actually listens, then prints its URL next to Vite's
 * own banner. The target port comes from the live server — no options
 * needed for the default setup.
 *
 * The plugin also adds the tunnel hostname to `server.allowedHosts` /
 * `preview.allowedHosts` (Vite >= 5.4.12 rejects unknown Host headers
 * with 403 — without this the tunneled request would never reach the
 * app).
 *
 * Invariants:
 * - a fatal tunnel failure NEVER kills the dev server (tools must not
 *   take the app down, same policy as @vkma.dev/devtools);
 * - explicit options beat the config file, the config file beats
 *   auto-detection from the server (flags > config > server > defaults);
 * - a server restart reuses the stored identity (stable URL) and closes
 *   the previous connection first.
 */

import type { Plugin } from "vite";
import { resolveTunnelConfig } from "./config/resolve.ts";
import { readProfileRecord, tunnelDataDir } from "./core/identity.ts";
import { createTunnel } from "./core/tunnel.ts";
import type { TunnelHandle, TunnelEvent } from "./core/types.ts";
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
	 * then passes without touching your config. The plugin additionally
	 * registers the real hostname in `allowedHosts`, so this option is a
	 * no-op for stock vite dev/preview; turn it off when your target
	 * genuinely needs the public Host header.
	 */
	hostRewrite?: boolean;
}

interface TunnelServerLike {
	httpServer: import("node:http").Server | null;
	config: {
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

	const stop = (): void => {
		const current = handle;
		handle = undefined;
		void current?.close().catch(() => undefined);
	};

	return {
		name: "vkma-tunnel",
		configureServer(server) {
			wireServer(server as unknown as TunnelServerLike, options, {
				setHandle: next => {
					stop();
					handle = next;
				},
				close: stop,
			});
		},
		configurePreviewServer(server) {
			wireServer(server as unknown as TunnelServerLike, options, {
				setHandle: next => {
					stop();
					handle = next;
				},
				close: stop,
				preview: true,
			});
		},
		closeServer() {
			stop();
		},
	};
}

interface WireContext {
	/** Close the active tunnel, if any (restarts and server shutdown). */
	close(): void;
	setHandle(handle: TunnelHandle): void;
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
	try {
		const { config } = await resolveTunnelConfig({
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
		let announced = false;
		let lastReason: string | undefined;
		let lastStage: string | undefined;
		let conflictHintShown = false;
		tunnel = await createTunnel({
			...config,
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
					void readProfileRecord(tunnelDataDir(), tunnel.profile)
						.then(record => {
							if (record?.pid !== undefined && record.pid !== process.pid) {
								serverLog(
									`tunnel: profile "${tunnel.profile}" was also attached by process ${String(record.pid)} — is another vkma-tunnel / vite dev still running?`,
									"yellow",
								);
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
	allowHost(server, tunnel.hostname, preview);

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
 * Adds the tunnel hostname to `server.allowedHosts` / `preview.allowedHosts`
 * (Vite >= 5.4.12 rejects foreign Host headers with 403). Safe to call
 * after connect: the check reads the config at request time.
 */
function allowHost(server: TunnelServerLike, hostname: string, preview: boolean): void {
	const target = preview ? server.config.preview : server.config.server;
	addAllowedHost(target, hostname);
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
