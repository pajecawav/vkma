/**
 * `createTunnel`: the one entry point the CLI, the Vite plugin and
 * library consumers share.
 *
 * Resolves defaults (provider, route, host, profile), validates them,
 * delegates to the selected provider and wraps its connection into a
 * {@link TunnelHandle}. Identity persistence (stable URL) is entirely the
 * provider's job through the shared record store; the core only owns the
 * record's shared metadata and the host-rewriting proxy.
 */

import { DEFAULT_HOST, DEFAULT_PROVIDER, DEFAULT_ROUTE, ROUTE_PATTERN } from "../constants.ts";
import { TunnelError } from "../errors.ts";
import { cloudflaredProvider } from "../providers/cloudflared.ts";
import { opentunnelProvider } from "../providers/opentunnel.ts";
import { localhostAliasFor, startForwardProxy, type ForwardProxy } from "../proxy.ts";
import { mergeRecordFile, readProfileRecord, tunnelDataDir } from "./identity.ts";
import { assertValidProfile, defaultProfile } from "./profile.ts";
import type {
	CreateTunnelOptions,
	TunnelHandle,
	TunnelProvider,
	TunnelProviderConnectOptions,
	TunnelProviderConnection,
} from "./types.ts";

/** Closed registry: adding a provider is a package release. */
const PROVIDERS: Readonly<Record<string, TunnelProvider>> = {
	[opentunnelProvider.id]: opentunnelProvider,
	[cloudflaredProvider.id]: cloudflaredProvider,
};

export function getTunnelProvider(id: string): TunnelProvider {
	const provider = PROVIDERS[id];
	if (provider === undefined) {
		throw new TunnelError(
			"config",
			`Unknown tunnel provider ${JSON.stringify(id)} — supported: ${Object.keys(PROVIDERS).join(", ")}`,
			{ code: "E_UNKNOWN_PROVIDER" },
		);
	}
	return provider;
}

/** Provider ids accepted by `--provider` / config / plugin options. */
export function tunnelProviderIds(): string[] {
	return Object.keys(PROVIDERS);
}

const UNHANDLED_HOST_HEADER = [
	"the public Host header reaches your app as is — make it acceptable there:",
	"in the Cloudflare dashboard set the tunnel's HTTP Host header override to localhost:<port>,",
	"or add the tunnel hostname to vite's server.allowedHosts",
].join(" ");

/**
 * Starts a tunnel for one local port and returns it once the provider
 * considers it live. With a persistent provider the public URL is stable
 * across runs: the identity persists per profile (default: the project
 * directory name); run `vkma-tunnel reset` to rotate it.
 */
export async function createTunnel(options: CreateTunnelOptions): Promise<TunnelHandle> {
	const providerId = options.provider ?? DEFAULT_PROVIDER;
	const provider = getTunnelProvider(providerId);

	const port = options.port;
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new TunnelError("config", `Invalid port ${String(port)}: expected 1-65535`, {
			code: "E_BAD_PORT",
		});
	}

	const host = options.host ?? DEFAULT_HOST;
	if (host.trim() === "") {
		throw new TunnelError("config", "Invalid host: expected a non-empty address", {
			code: "E_BAD_HOST",
		});
	}

	const route = options.route ?? DEFAULT_ROUTE;
	if (!ROUTE_PATTERN.test(route)) {
		throw new TunnelError(
			"config",
			`Invalid route ${JSON.stringify(route)}: expected "@" (apex) or one lowercase DNS label (letters, digits, hyphens)`,
			{ code: "E_BAD_ROUTE" },
		);
	}

	const profile = options.profile ?? defaultProfile(options.cwd ?? process.cwd());
	assertValidProfile(profile);

	const env = options.env ?? process.env;
	const dataDir = tunnelDataDir(env, options.dataDir);

	const connectOptions: TunnelProviderConnectOptions = {
		profile,
		route,
		host,
		port,
		api: options.api,
		dataDir,
		signal: options.signal,
		onEvent: options.onEvent,
		onProgress: options.onProgress,
		keepAlive: options.keepAlive,
		cloudflared: options.cloudflared,
		env,
		onWarning: options.onWarning,
	};

	// -- profile ownership ---------------------------------------------------
	//
	// A profile record belongs to ONE provider: two providers writing the
	// same file would overwrite each other's `hostname` (and corrupt an
	// opentunnel identity). Records without a `provider` predate the second
	// provider and are opentunnel's.
	const existing = await readProfileRecord(dataDir, profile);
	const recordProvider =
		existing === undefined ? undefined : (existing.provider ?? opentunnelProvider.id);
	if (existing !== undefined && recordProvider !== providerId) {
		throw new TunnelError(
			"config",
			[
				`Profile ${JSON.stringify(profile)} belongs to provider "${String(recordProvider)}" — refusing to run "${providerId}" on it`,
				`Use another --profile, or drop that identity first: vkma-tunnel reset --profile ${profile}`,
			].join("\n"),
			{ code: "E_PROVIDER_MISMATCH" },
		);
	}

	// A run with nothing stable to store (a one-time URL) writes no record.
	const storesIdentity = provider.persistentIdentity?.(connectOptions) !== false;

	// -- shared metadata -----------------------------------------------------
	//
	// For `list`/`status` — the REAL target, stamped even when the run never
	// reaches a healthy connection. The forwarding proxy (if any) is an
	// implementation detail and must not leak here.
	//
	// `pid`/`startedAt` are deliberately NOT part of this stamp: they name
	// the bridge HOLDER and are written only once this process has
	// attached (below). Stamping them here would overwrite the incumbent's
	// pid with our own before our first attach attempt — and the
	// route-conflict hint, printed exactly while we are still fighting for
	// the route, would always find itself.
	const pid = options.pid ?? process.pid;
	// A provider that knows its hostname up front gets it into the record
	// now: the record is what `list`/`status` read, and unlike opentunnel
	// this provider stores no identity of its own that would carry it.
	const knownHostname = provider.knownHostname?.(connectOptions);
	if (storesIdentity) {
		await mergeRecordFile(dataDir, profile, {
			provider: providerId,
			...(knownHostname === undefined ? {} : { hostname: knownHostname }),
			lastTarget: `${host}:${String(port)}`,
			lastRoute: route,
			updatedAt: new Date().toISOString(),
		});
	}

	// -- the Host header the target sees -------------------------------------
	//
	// Vite >= 5.4.12 rejects foreign Host headers (dev AND preview) unless
	// they are `localhost` or `*.localhost`. Whoever can make the header
	// acceptable is the provider's call (TunnelProvider.hostHeaderPolicy).
	const hostHeader =
		options.hostRewrite === false
			? "off"
			: (provider.hostHeaderPolicy?.(connectOptions) ?? "proxy");
	if (hostHeader === "unhandled") {
		options.onWarning?.(UNHANDLED_HOST_HEADER);
	}

	// `proxy`: a loopback forward proxy substitutes the tunnel hostname
	// with a same-length `*.localhost` alias. The tunnel hostname is only
	// known after provisioning: on the first run we connect directly and
	// retarget through `setRoutes` once it is.
	let proxy: ForwardProxy | undefined;
	let forwardHost = host;
	let forwardPort = port;
	if (hostHeader === "proxy") {
		const known = existing?.hostname;
		const alias = known === undefined ? undefined : localhostAliasFor(known);
		if (known !== undefined && alias !== undefined) {
			proxy = await startForwardProxy({
				targetHost: host,
				targetPort: port,
				tunnelHostname: known,
				localhostAlias: alias,
			});
			forwardHost = "127.0.0.1";
			forwardPort = proxy.port;
		}
	}

	let connection: TunnelProviderConnection;
	try {
		connection = await provider.connect({
			...connectOptions,
			host: forwardHost,
			port: forwardPort,
		});
	} catch (error) {
		// With a stored identity the rewriting proxy is already listening:
		// a failed connect must not leave it behind — a listening server
		// keeps the process alive long after the caller gave up.
		await proxy?.close().catch(() => undefined);
		throw error;
	}

	// From here on everything is ours to unwind: a bridge nobody holds
	// keeps the route, a proxy nobody closes keeps the process.
	try {
		if (storesIdentity) {
			// First attach done: THIS process now holds the route.
			const attachedAt = new Date().toISOString();
			await mergeRecordFile(dataDir, profile, {
				pid,
				startedAt: attachedAt,
				updatedAt: attachedAt,
			});
		}

		// First run: the identity (and its hostname) appeared during this
		// connect — start the proxy now and retarget the live bridge. Safe
		// because the URL is only printed after this returns.
		if (proxy === undefined && hostHeader === "proxy") {
			const alias = localhostAliasFor(connection.hostname);
			if (alias !== undefined && connection.setRoutes !== undefined) {
				proxy = await startForwardProxy({
					targetHost: host,
					targetPort: port,
					tunnelHostname: connection.hostname,
					localhostAlias: alias,
				});
				await connection
					.setRoutes({ [route]: `127.0.0.1:${String(proxy.port)}` })
					.catch(() => undefined);
			}
		}

		const primaryUrlOf = (): string =>
			connection.urls[route] ?? Object.values(connection.urls)[0] ?? "";
		// Should be unreachable with a well-behaved provider; the invariant
		// "handle.primaryUrl is printable" is too useful to leave soft.
		if (primaryUrlOf() === "") {
			throw new TunnelError("network", `${providerId}: connected without any public URL`, {
				code: "E_NO_URL",
			});
		}

		// `hostname`/`urls`/`primaryUrl` follow the provider: a respawned
		// Quick Tunnel has a new URL under the same handle (`url-changed`).
		return {
			provider: providerId,
			profile,
			get hostname() {
				return connection.hostname;
			},
			get urls() {
				return connection.urls;
			},
			get primaryUrl() {
				return primaryUrlOf();
			},
			events: connection.events,
			status: connection.status,
			close: async () => {
				await connection.close();
				await proxy?.close();
			},
			closed: connection.closed.finally(() => {
				void proxy?.close().catch(() => undefined);
			}),
		};
	} catch (error) {
		await connection.close().catch(() => undefined);
		await proxy?.close().catch(() => undefined);
		throw error;
	}
}
