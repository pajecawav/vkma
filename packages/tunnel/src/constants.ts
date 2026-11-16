/**
 * Shared defaults for the tunnel package.
 *
 * One source of truth for the config schema, the CLI, the Node API and the
 * Vite plugin — a default that differs between surfaces is a bug.
 */

/** The only provider shipped in v0.1. */
export const DEFAULT_PROVIDER = "opentunnel";

/** Vite's default dev port — the most common mini app dev target. */
export const DEFAULT_PORT = 5173;

/** Loopback forward target; the tunnel always dials the local machine. */
export const DEFAULT_HOST = "127.0.0.1";

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
