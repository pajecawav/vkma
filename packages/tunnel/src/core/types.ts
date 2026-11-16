/**
 * Provider-neutral tunnel surface.
 *
 * The Node API (`createTunnel`), the CLI and the Vite plugin all speak
 * these types; the only shipped provider (opentunnel) adapts to them.
 * The event union mirrors the opentunnel client 1:1 (lossless pass-through)
 * with field names generic enough for future providers: a minimal provider
 * emits `connected` and `stopped`, nothing else is required.
 */

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
	readonly provider: string;
	/** Identity-store profile this tunnel persists as (stable URL). */
	readonly profile: string;
	/** Public hostname, e.g. `<id>.opentunnel.xyz`. */
	readonly hostname: string;
	/** Public URL per route; follows route changes. */
	readonly urls: Readonly<Record<string, string>>;
	/** The URL for the requested route (what the CLI prints). */
	readonly primaryUrl: string;
	readonly events: AsyncIterable<TunnelEvent>;
	readonly status: () => TunnelStatus;
	/** Stops the tunnel and frees provider resources. Idempotent. */
	readonly close: () => Promise<void>;
	/** Settles when the tunnel stops (fatal error or `close()`); rejection carries the error. */
	readonly closed: Promise<void>;
}

/** Options for {@link createTunnel}. */
export interface CreateTunnelOptions {
	/** Provider id. Default `"opentunnel"`; unknown ids are a config error. */
	readonly provider?: string;
	/** Local port to expose. Required (5173 via config resolution). */
	readonly port: number;
	/** Local host the tunnel forwards to. Default `"127.0.0.1"`. */
	readonly host?: string;
	/** Route name: `"@"` (apex) or a lowercase DNS label. Default `"@"`. */
	readonly route?: string;
	/** Identity-store profile. Default: project directory name (see `defaultProfile`). */
	readonly profile?: string;
	/** Provider API endpoint (self-hosted servers). */
	readonly api?: string;
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
}

/** What a provider needs to serve one tunnel. */
export interface TunnelProviderConnectOptions {
	readonly profile: string;
	readonly route: string;
	readonly host: string;
	readonly port: number;
	readonly api?: string;
	readonly dataDir: string;
	readonly signal?: AbortSignal;
	readonly onEvent?: (event: TunnelEvent) => void;
	/** Provider provisioning stages; human-readable, provider-specific. */
	readonly onProgress?: (stage: string) => void;
	/**
	 * Health watchdog (default `true`): a probe through the public URL
	 * every ~20 s. It keeps idle bridges from being dropped silently AND
	 * detects a wedged server-side relay (bridge "connected" but visitor
	 * connections hang forever): two consecutive soft timeouts with a
	 * reachable local target trigger a graceful bridge restart — same
	 * identity, same public URL, fresh relay.
	 */
	readonly keepAlive?: boolean;
}

/** The live connection a provider returns; wrapped into a `TunnelHandle`. */
export interface TunnelProviderConnection {
	readonly hostname: string;
	readonly urls: Readonly<Record<string, string>>;
	readonly events: AsyncIterable<TunnelEvent>;
	readonly status: () => TunnelStatus;
	readonly close: () => Promise<void>;
	readonly closed: Promise<void>;
}

/**
 * A tunnel provider. Public type so signatures read clearly and future
 * providers (cloudflared, …) can be dropped in; the registry itself stays
 * closed in v0.1 — `provider: "opentunnel"` is the only valid value.
 *
 * Provider contract for the shared identity-store surface: every provider
 * persists one JSON record per profile under its `dataDir` holding at
 * least `hostname`, `lastTarget`, `createdAt` and `updatedAt` so the CLI
 * `list`/`status`/`reset` commands stay provider-neutral.
 */
export interface TunnelProvider {
	readonly id: string;
	connect(options: TunnelProviderConnectOptions): Promise<TunnelProviderConnection>;
}
