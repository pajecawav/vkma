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
import { tunnelDataDir } from "./identity.ts";
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

	const connection = await provider.connect({
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
	});

	const primaryUrl = connection.urls[route] ?? Object.values(connection.urls)[0] ?? "";
	if (primaryUrl === "") {
		// Should be unreachable with a well-behaved provider; the invariant
		// "handle.primaryUrl is printable" is too useful to leave soft.
		await connection.close().catch(() => undefined);
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
		close: connection.close,
		closed: connection.closed,
	};
}
