import type { TunnelConfigInput } from "./schema.ts";

/**
 * `defineTunnelConfig`, identity function providing type completion for
 * config files (`vkma-tunnel.config.ts`) without any runtime behavior.
 *
 * Deliberately non-generic: a generic `<T extends TunnelConfigInput>`
 * disables excess-property checks, letting stray keys (e.g. `$schema`)
 * slip through unnoticed.
 */
export function defineTunnelConfig(config: TunnelConfigInput): TunnelConfigInput {
	return config;
}
