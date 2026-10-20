import type { DeployConfigInput } from "./schema.ts";

/**
 * `defineDeployConfig` — identity function providing type completion for
 * config files (`vkma-deploy.config.ts`) without any runtime behavior.
 *
 * Deliberately non-generic: a generic `<T extends DeployConfigInput>`
 * disables excess-property checks, letting stray keys (e.g. `$schema`)
 * slip through unnoticed.
 */
export function defineDeployConfig(config: DeployConfigInput): DeployConfigInput {
	return config;
}
