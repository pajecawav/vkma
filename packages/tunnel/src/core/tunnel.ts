/**
 * `createTunnel`: the one entry point the CLI, the Vite plugin and
 * library consumers share.
 *
 * Resolves defaults (provider, route, host, profile), validates them,
 * delegates to the selected provider and wraps its connection into a
 * {@link TunnelHandle}. Identity persistence (stable URL) is entirely the
 * provider's job through the shared record store; the core only owns the
 * record's shared metadata and the host-rewriting proxy. It reads no
 * provider's config section: what it must know (the route, the Host
 * header policy, whether a run stores an identity) comes from the
 * provider's capabilities.
 */

import {
	DEFAULT_HOST,
	DEFAULT_PROVIDER,
	DEFAULT_ROUTE,
	ROUTE_PATTERN,
	type TunnelProviderId,
} from "../constants.ts";
import { TunnelError } from "../errors.ts";
import { cloudflaredProvider } from "../providers/cloudflared.ts";
import { opentunnelProvider } from "../providers/opentunnel.ts";
import { localhostAliasFor, startForwardProxy, type ForwardProxy } from "../proxy.ts";
import {
	mergeRecordFile,
	readProfileRecordFile,
	removeRecordIfUntouched,
	tunnelDataDir,
} from "./identity.ts";
import { assertValidProfile, defaultProfile } from "./profile.ts";
import type {
	CreateTunnelOptions,
	TunnelHandle,
	TunnelProvider,
	TunnelProviderConnectOptions,
	TunnelProviderConnection,
} from "./types.ts";

/**
 * Closed registry: adding a provider is a package release. `satisfies`
 * keeps it exactly as wide as `TUNNEL_PROVIDER_IDS` — a provider without
 * an id in the list (or the reverse) does not compile.
 */
const PROVIDERS = {
	[opentunnelProvider.id]: opentunnelProvider,
	[cloudflaredProvider.id]: cloudflaredProvider,
} satisfies Readonly<Record<TunnelProviderId, TunnelProvider>>;

export function getTunnelProvider(id: string): TunnelProvider {
	const provider: TunnelProvider | undefined = PROVIDERS[id as TunnelProviderId];
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
	// The provider's own teardown bound, for a caller capping its wait on it.
	const closeTimeoutMs = provider.closeTimeoutMs?.();

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

	// The project's directory: the default profile's name and the base of a
	// relative `cloudflared.binary` both come from it.
	const cwd = options.cwd ?? process.cwd();
	const profile = options.profile ?? defaultProfile(cwd);
	assertValidProfile(profile);

	const env = options.env ?? process.env;
	const dataDir = tunnelDataDir(env, options.dataDir);

	const connectOptions: TunnelProviderConnectOptions = {
		profile,
		host,
		port,
		cwd,
		opentunnel: options.opentunnel,
		dataDir,
		signal: options.signal,
		onEvent: options.onEvent,
		onProgress: options.onProgress,
		keepAlive: options.keepAlive,
		hostRewrite: options.hostRewrite,
		cloudflared: options.cloudflared,
		env,
		onWarning: options.onWarning,
	};

	// The route is the provider's to name (opentunnel: its config section)
	// and the core's to vouch for in the shared record: it keys the
	// handle's `urls` and lands in `lastRoute`, which `list`/`status`
	// render for any provider. So its format is checked here — before
	// anything is stored.
	const route = provider.primaryRoute?.(connectOptions) ?? DEFAULT_ROUTE;
	if (!ROUTE_PATTERN.test(route)) {
		throw new TunnelError(
			"config",
			`Invalid route ${JSON.stringify(route)}: expected "@" (apex) or one lowercase DNS label (letters, digits, hyphens)`,
			{ code: "E_BAD_ROUTE" },
		);
	}

	// A run with nothing stable to store (a one-time URL) writes no record.
	const storesIdentity = provider.persistentIdentity?.(connectOptions) !== false;

	// -- profile ownership ---------------------------------------------------
	//
	// A profile record belongs to ONE provider: two providers writing the
	// same file would overwrite each other's `hostname` (and corrupt an
	// opentunnel identity). Records without a `provider` predate the second
	// provider and are opentunnel's.
	//
	// Only a run that WRITES a record can corrupt one, so only a storing
	// run is held to this — and a storing run is the only one that reads
	// the profile's identity. A Quick Tunnel stores nothing and therefore
	// runs under any profile. Refusing it would block `--provider
	// cloudflared` on every project that ever ran the default tunnel, with
	// a hint whose way out is dropping a stable URL.
	//
	// The owner is read from the FILE, not through the hostname. An
	// opentunnel identity in the making has none yet (the SDK stores a
	// `pending` record before the certificate is issued), and read through
	// the hostname it was invisible: a cloudflared token run took such a
	// profile over, and the default tunnel was refused on it afterwards.
	const stored = storesIdentity
		? await readProfileRecordFile(dataDir, profile, opentunnelProvider.id)
		: undefined;
	const existing = stored?.record;
	// Undefined when the profile has no record file at all.
	const owner = stored?.owner;
	if (owner !== undefined && owner !== providerId) {
		throw new TunnelError(
			"config",
			[
				`Profile ${JSON.stringify(profile)} belongs to provider "${owner}" — refusing to run "${providerId}" on it`,
				// True for both: opentunnel's record IS the identity, and its URL
				// goes with it; cloudflared's only names a tunnel that lives in
				// the account and keeps its hostname.
				[
					`Pick another profile (the CLI's --profile <name>, the plugin's \`profile\` option).`,
					`Or free this one with vkma-tunnel reset --profile ${profile} — that deletes what "${owner}" stored under it;`,
					"when that is a minted identity, its public URL does not come back.",
				].join(" "),
			].join("\n"),
			{ code: "E_PROVIDER_MISMATCH" },
		);
	}

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
	// The stamp itself is kept: a connect that fails takes it back (below).
	const stamp: Record<string, unknown> = {
		provider: providerId,
		...(knownHostname === undefined ? {} : { hostname: knownHostname }),
		lastTarget: `${host}:${String(port)}`,
		lastRoute: route,
		updatedAt: new Date().toISOString(),
	};
	if (storesIdentity) {
		await mergeRecordFile(dataDir, profile, stamp);
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
		// A run that could not even connect owns no profile: the record this
		// run created goes again, unless the provider put something of its
		// own into it (an opentunnel identity in the making). As first
		// written, a cloudflared token run that failed on a missing token or
		// binary left `provider: "cloudflared"` behind, and from then on the
		// default tunnel was refused on that project until `reset`.
		if (storesIdentity && owner === undefined) {
			await removeRecordIfUntouched(dataDir, profile, stamp).catch(() => undefined);
		}
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
				// Not fatal, and not silent either. The bridge keeps forwarding
				// the public Host header, which vite answers with 403 unless the
				// hostname is allowed. The proxy stays up: the provider remembered
				// the new target, and the next bridge attaches to it.
				const target = `127.0.0.1:${String(proxy.port)}`;
				await connection.setRoutes({ [route]: target }).catch((error: unknown) => {
					options.onWarning?.(
						`the tunnel could not be switched to the host-rewriting proxy (${error instanceof Error ? error.message : String(error)}) — until the bridge reconnects, requests carry the public Host header, which vite rejects with 403 unless it is allowed`,
					);
				});
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
			...(closeTimeoutMs === undefined ? {} : { closeTimeoutMs }),
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
