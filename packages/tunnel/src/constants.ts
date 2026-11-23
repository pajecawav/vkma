/**
 * Shared defaults for the tunnel package.
 *
 * One source of truth for the config schema, the CLI, the Node API and the
 * Vite plugin — a default that differs between surfaces is a bug.
 */

/** The default provider. */
export const DEFAULT_PROVIDER = "opentunnel";

/**
 * Cloudflare Tunnel through the `cloudflared` binary (v0.2). Opt-in:
 * Cloudflare is not reachable from every network, which is the user's call.
 */
export const CLOUDFLARED_PROVIDER = "cloudflared";

/**
 * `"quick"`: a one-time `trycloudflare.com` URL, no account — the hostname
 * changes on every start and needs a minute to warm up. `"token"`: a named
 * tunnel from the Cloudflare dashboard with a stable hostname.
 */
export const DEFAULT_CLOUDFLARED_MODE = "quick";

/**
 * `http2` rather than cloudflared's own default (`quic`): where UDP 7844 is
 * blocked, QUIC registers and then dies every few seconds without falling
 * back within a minute, while HTTP/2 connects and stays.
 */
export const DEFAULT_CLOUDFLARED_PROTOCOL = "http2";

/** Looked up on PATH; nothing is ever downloaded. */
export const DEFAULT_CLOUDFLARED_BINARY = "cloudflared";

/** Vite's default dev port — the most common mini app dev target. */
export const DEFAULT_PORT = 5173;

/**
 * Loopback forward target. `localhost` (not 127.0.0.1) on purpose: Node
 * resolves it to ::1 first, and modern dev servers (vite preview on
 * Node >= 17) bind IPv6 loopback only — 127.0.0.1 dials would refuse.
 */
export const DEFAULT_HOST = "localhost";

/** Apex route: the tunnel hostname itself, `https://<id>.opentunnel.xyz`. */
export const DEFAULT_ROUTE = "@";

export const CONFIG_BASENAME = "vkma-tunnel.config";
export const CONFIG_EXTENSIONS = ["ts", "mts", "js", "mjs", "json"] as const;

/**
 * Route name accepted by every surface: the apex `@` or one lowercase DNS
 * label (subdomain). Mirrors the opentunnel route contract without
 * importing it into provider-neutral code.
 */
export const ROUTE_PATTERN = /^(@|[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)$/;

/** Profile names become filenames in the identity store — keep them tame. */
export const PROFILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * A public DNS hostname: lowercase letters, digits and hyphens in labels
 * that neither start nor end with a hyphen, at least two labels.
 */
export const HOSTNAME_PATTERN =
	/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
