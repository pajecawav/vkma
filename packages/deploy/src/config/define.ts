/**
 * `defineDeployConfig` — identity function providing type completion for
 * config files (`vkma-deploy.config.ts`) without any runtime behavior.
 */

import type { DeployConfigInput } from "./schema.ts";

export function defineDeployConfig<T extends DeployConfigInput>(config: T): T {
	return config;
}
