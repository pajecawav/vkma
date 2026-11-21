/**
 * `createTunnel`: the one entry point the CLI, the Vite plugin and
 * library consumers share.
 *
 * Resolves defaults (provider, route, host, profile), validates them,
 * delegates to the selected provider and wraps its connection into a
 * {@link TunnelHandle}. Identity persistence (stable URL) is entirely the
 * provider's job through the shared record store.
 */

import { DEFAULT_HOST, DEFAULT_PROVIDER, DEFAULT_ROUTE, ROUTE_PATTERN } from "../constants.ts";
import { TunnelError } from "../errors.ts";
import { opentunnelProvider } from "../providers/opentunnel.ts";
import { localhostAliasFor, startForwardProxy, type ForwardProxy } from "../proxy.ts";
import { mergeRecordFile, readProfileRecord, tunnelDataDir } from "./identity.ts";
import { assertValidProfile, defaultProfile } from "./profile.ts";
import type { CreateTunnelOptions, TunnelHandle, TunnelProvider } from "./types.ts";

/** Closed registry (v0.1): adding a provider is a package release. */
const PROVIDERS: Readonly<Record<string, TunnelProvider>> = {
	[opentunnelProvider.id]: opentunnelProvider,
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

/**
 * Starts a tunnel for one local port and returns it once the first
 * bridge attach succeeds. The public URL is stable across runs: the
 * identity persists per profile (default: the project directory name);
 * run `vkma-tunnel reset` to rotate it.
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

	const dataDir = tunnelDataDir(options.env ?? process.env, options.dataDir);

	// Shared metadata for `list`/`status` — the REAL target, stamped even
	// when the run never reaches a healthy connection. The forwarding
	// proxy (if any) is an implementation detail and must not leak here.
	// `pid` identifies the live bridge holder: on a route_conflict the
	// record tells the loser which process to look for.
	const pid = options.pid ?? process.pid;
	await mergeRecordFile(dataDir, profile, {
		lastTarget: `${host}:${String(port)}`,
		lastRoute: route,
		pid,
		startedAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	});

	// -- host rewriting (vite allowedHosts) ---------------------------------
	//
	// Vite >= 5.4.12 rejects foreign Host headers (dev AND preview) unless
	// they are `localhost` or `*.localhost`. A loopback forward proxy
	// substitutes the tunnel hostname with a same-length `*.localhost`
	// alias, so a CLI-driven tunnel works with stock vite configs. The
	// tunnel hostname is only known after provisioning: on the first run
	// we connect directly and retarget through `setRoutes` once it is.
	let proxy: ForwardProxy | undefined;
	let forwardHost = host;
	let forwardPort = port;
	if (options.hostRewrite !== false) {
		const known = (await readProfileRecord(dataDir, profile))?.hostname;
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

	const connection = await provider.connect({
		profile,
		route,
		host: forwardHost,
		port: forwardPort,
		api: options.api,
		dataDir,
		signal: options.signal,
		onEvent: options.onEvent,
		onProgress: options.onProgress,
		keepAlive: options.keepAlive,
	});

	// First run: the identity (and its hostname) appeared during this
	// connect — start the proxy now and retarget the live bridge. Safe
	// because the URL is only printed after this returns.
	if (proxy === undefined && options.hostRewrite !== false) {
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

	const primaryUrl = connection.urls[route] ?? Object.values(connection.urls)[0] ?? "";
	if (primaryUrl === "") {
		// Should be unreachable with a well-behaved provider; the invariant
		// "handle.primaryUrl is printable" is too useful to leave soft.
		await connection.close().catch(() => undefined);
		await proxy?.close();
		throw new TunnelError("network", `${providerId}: connected without any public URL`, {
			code: "E_NO_URL",
		});
	}

	return {
		provider: providerId,
		profile,
		hostname: connection.hostname,
		urls: connection.urls,
		primaryUrl,
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
}
