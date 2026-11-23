/**
 * Provider-neutral tunnel surface.
 *
 * The Node API (`createTunnel`), the CLI and the Vite plugin all speak
 * these types; the shipped providers (opentunnel, cloudflared) adapt to
 * them. The event union mirrors the opentunnel client 1:1 (lossless
 * pass-through) with field names generic enough for other providers: a
 * minimal provider emits `connected` and `stopped`, nothing else is
 * required. Additions stay additive — renderers ignore unknown types.
 */

import type { CloudflaredOptionsInput, OpentunnelOptionsInput } from "../config/schema.ts";
import type { TunnelProviderId } from "../constants.ts";

export type TunnelEvent =
	| { readonly type: "connecting"; readonly attempt: number }
	| { readonly type: "connected"; readonly session: string; readonly routes: readonly string[] }
	| { readonly type: "disconnected"; readonly reason: string }
	| { readonly type: "reconnecting"; readonly attempt: number; readonly delayMs: number }
	| { readonly type: "route-conflict"; readonly routes: readonly string[] }
	| {
			readonly type: "connection-opened";
			readonly conn: number;
			readonly route: string;
			readonly peer: string;
	  }
	| {
			readonly type: "connection-closed";
			readonly conn: number;
			readonly route: string;
			readonly error?: string;
	  }
	| { readonly type: "certificate-renewed"; readonly expiry: string }
	/**
	 * The public URL was replaced under the same handle — cloudflared's
	 * quick tunnels mint a new hostname whenever the process restarts. The
	 * handle's `hostname`/`urls`/`primaryUrl` already return the new value
	 * when this arrives; consumers print a fresh banner.
	 */
	| { readonly type: "url-changed"; readonly url: string }
	| { readonly type: "stopped"; readonly error?: string };

export interface TunnelStatus {
	readonly state: "connecting" | "connected" | "reconnecting" | "stopped";
	readonly hostname: string;
	readonly connections: number;
	readonly lastError?: string;
}

/** A live tunnel: resolved once the first bridge attach succeeds. */
export interface TunnelHandle {
	/** Provider id that served this tunnel. */
	readonly provider: TunnelProviderId;
	/** Identity-store profile this tunnel persists as (stable URL). */
	readonly profile: string;
	/** Public hostname, e.g. `<id>.opentunnel.xyz`. */
	readonly hostname: string;
	/** Public URL per route; follows route changes. */
	readonly urls: Readonly<Record<string, string>>;
	/** The URL for the requested route (what the CLI prints). */
	readonly primaryUrl: string;
	/**
	 * Lifecycle and traffic events. A bounded tail is buffered until the
	 * first iteration starts, then events stream live. The iterable ENDS
	 * once the tunnel has stopped: after `stopped` on a clean stop; on a
	 * fatal error it just ends and `closed` carries the error.
	 */
	readonly events: AsyncIterable<TunnelEvent>;
	readonly status: () => TunnelStatus;
	/** Stops the tunnel and frees provider resources. Idempotent. */
	readonly close: () => Promise<void>;
	/** Settles when the tunnel stops (fatal error or `close()`); rejection carries the error. */
	readonly closed: Promise<void>;
}

/** Options for {@link createTunnel}. */
export interface CreateTunnelOptions {
	/** Provider. Default `"opentunnel"`; anything else is a config error. */
	readonly provider?: TunnelProviderId;
	/** Local port to expose. Required (5173 via config resolution). */
	readonly port: number;
	/** Local host the tunnel forwards to. Default `"localhost"`. */
	readonly host?: string;
	/** Identity-store profile. Default: project directory name (see `defaultProfile`). */
	readonly profile?: string;
	/** Options of the `opentunnel` provider (its config section, defaults applied by the provider). */
	readonly opentunnel?: OpentunnelOptionsInput;
	/** Identity store root. Default: `$XDG_DATA_HOME/vkma/tunnel`. */
	readonly dataDir?: string;
	/** Directory for the default-profile derivation. Default: `process.cwd()`. */
	readonly cwd?: string;
	/** Environment snapshot for XDG resolution (tests); default `process.env`. */
	readonly env?: Record<string, string | undefined>;
	readonly signal?: AbortSignal;
	readonly onEvent?: (event: TunnelEvent) => void;
	/** Provisioning progress (`"creating-tunnel"`, `"waiting-certificate"`, …) — transient, not part of the event stream. */
	readonly onProgress?: (stage: string) => void;
	/** Keep the bridge busy with a periodic self-probe (default `true`); see `TunnelProviderConnectOptions.keepAlive`. */
	readonly keepAlive?: boolean;
	/** Process id stamped into the profile record on attach (route-conflict hints). Default: `process.pid`. */
	readonly pid?: number;
	/**
	 * Rewrite the tunnel hostname to a same-length `*.localhost` alias in
	 * requests forwarded to the local target (default `true`). Vite's
	 * DNS-rebinding protection (dev AND preview) rejects foreign Host
	 * headers; `*.localhost` is always allowed, and the alias matching the
	 * tunnel hostname's byte length makes the rewrite a pure byte
	 * substitution — WebSocket upgrades and pipelining pass through.
	 * Turn off when the local target genuinely needs the public Host
	 * (e.g. virtual-host routing) or serves its own TLS.
	 */
	readonly hostRewrite?: boolean;
	/** Options of the `cloudflared` provider (its config section as written; the provider applies the defaults). */
	readonly cloudflared?: CloudflaredOptionsInput;
	/**
	 * Human-readable warnings (an outdated binary, a URL that is still
	 * warming up). Transient like `onProgress`: not part of the event
	 * stream, surfaced by the CLI and the plugin in yellow.
	 */
	readonly onWarning?: (message: string) => void;
}

/** What a provider needs to serve one tunnel. */
export interface TunnelProviderConnectOptions {
	readonly profile: string;
	readonly host: string;
	readonly port: number;
	/** The `opentunnel` section as the caller gave it; the provider applies its defaults. */
	readonly opentunnel?: OpentunnelOptionsInput;
	readonly dataDir: string;
	readonly signal?: AbortSignal;
	readonly onEvent?: (event: TunnelEvent) => void;
	/** Provider provisioning stages; human-readable, provider-specific. */
	readonly onProgress?: (stage: string) => void;
	/**
	 * Health watchdog (default `true`): a probe through the public URL
	 * every ~20 s. It keeps idle bridges from being dropped silently AND
	 * detects a wedged server-side relay (bridge "connected" but visitor
	 * connections hang forever): two consecutive failed probes through
	 * the public URL while the local target answers a DIRECT probe trigger
	 * a graceful bridge restart — same identity, same public URL, fresh
	 * relay. Any tunneled failure counts, a fast TLS reset included: the
	 * service resets handshakes within a second when its relay dies.
	 */
	readonly keepAlive?: boolean;
	/** The `cloudflared` section as the caller gave it; the provider applies its defaults. */
	readonly cloudflared?: CloudflaredOptionsInput;
	/**
	 * Environment the provider may read and hand to a child process
	 * (`TUNNEL_TOKEN`, `PATH`). Whatever the caller injected into
	 * `createTunnel`; a provider never goes to `process.env` itself.
	 */
	readonly env?: Record<string, string | undefined>;
	/** See `CreateTunnelOptions.onWarning`. */
	readonly onWarning?: (message: string) => void;
}

/** The live connection a provider returns; wrapped into a `TunnelHandle`. */
export interface TunnelProviderConnection {
	readonly hostname: string;
	readonly urls: Readonly<Record<string, string>>;
	readonly events: AsyncIterable<TunnelEvent>;
	readonly status: () => TunnelStatus;
	readonly close: () => Promise<void>;
	readonly closed: Promise<void>;
	/**
	 * Points the CURRENT bridge at a new target (same route names — an
	 * instant target change, no re-attach). Optional: providers whose
	 * relay cannot retarget live may omit it; the core then starts its
	 * forwarding proxy before connecting instead of swapping mid-run.
	 */
	readonly setRoutes?: (routes: Readonly<Record<string, string>>) => Promise<void>;
}

/**
 * A tunnel provider. Public type so signatures read clearly; the registry
 * itself stays closed — adding a provider is a package release.
 *
 * Provider contract for the shared identity-store surface: a provider with
 * a persistent identity stores one JSON record per profile under its
 * `dataDir` holding at least `provider`, `hostname`, `lastTarget`,
 * `createdAt` and `updatedAt` so the CLI `list`/`status`/`reset` commands
 * stay provider-neutral.
 */
export interface TunnelProvider<Id extends string = string> {
	readonly id: Id;
	/**
	 * Who makes the Host header acceptable to the local target (Vite's
	 * `allowedHosts` rejects foreign hosts)?
	 *
	 * - `"proxy"` (the default): the core's host-rewriting proxy, unless
	 *   the caller turned `hostRewrite` off — opentunnel;
	 * - `"provider"`: the provider rewrites it itself and the core starts
	 *   no proxy — cloudflared quick mode (`--http-host-header`);
	 * - `"unhandled"`: neither can — the core starts no proxy and warns:
	 *   cloudflared token mode, where the dashboard's origin settings
	 *   decide what the target sees and traffic never passes the proxy.
	 */
	readonly hostHeaderPolicy?: (
		options: TunnelProviderConnectOptions,
	) => "proxy" | "provider" | "unhandled";
	/**
	 * False for runs that have nothing stable to store (cloudflared quick
	 * mode mints a one-time URL): the core then writes no profile record.
	 * Undefined means true.
	 */
	readonly persistentIdentity?: (options: TunnelProviderConnectOptions) => boolean;
	/**
	 * The public hostname of a persistent run, known BEFORE anything is
	 * stored (cloudflared token mode: the configured hostname). The core
	 * stamps it into the profile record so `list`/`status` see the run
	 * even when the provider keeps no identity of its own. Undefined when
	 * the hostname only appears later (opentunnel mints it).
	 */
	readonly knownHostname?: (options: TunnelProviderConnectOptions) => string | undefined;
	/**
	 * The public route a run serves — the key of `urls` that the handle's
	 * `primaryUrl` reports and the value the core stamps into the record's
	 * shared `lastRoute` (opentunnel: its configured route). The core never
	 * reads a provider's section, so the provider names it here; the FORMAT
	 * stays the core's to check, it is shared by `list`/`status` for every
	 * provider. Undefined means `"@"`: the hostname itself, the only route
	 * a provider without routes has.
	 */
	readonly primaryRoute?: (options: TunnelProviderConnectOptions) => string | undefined;
	connect(options: TunnelProviderConnectOptions): Promise<TunnelProviderConnection>;
}
