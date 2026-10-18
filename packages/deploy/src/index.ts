/**
 * Public API of `@vkma.dev/deploy`.
 *
 * Library surface:
 * - `deploy()` — full deploy flow (resolves config automatically when needed)
 * - `resolveConfig()` — discovery + merge + validation only
 * - `defineDeployConfig()` — type helper for config files
 * - granular building blocks (zip, upload, queue, login, API client)
 * - typed errors (`DeployError`) — the library never calls `process.exit`
 */

export { DeployError, ConfigValidationError, isDeployError, toDeployError } from "./errors.ts";
export type { DeployErrorKind, DeployErrorOptions, ConfigIssue } from "./errors.ts";

export { DeployConfigSchema, deployConfigJsonSchema, CONFIG_DEFAULTS } from "./config/schema.ts";
export type {
	DeployConfigInput,
	ResolvedConfig,
	ResolvedConfigMeta,
	ResolveResult,
	ConfigSource,
} from "./config/schema.ts";

export { defineDeployConfig } from "./config/define.ts";
export { resolveConfig, findConfigFile } from "./config/resolve.ts";
export type { ResolveConfigOptions } from "./config/resolve.ts";
export { LEGACY_CONFIG_FILENAME } from "./config/legacy.ts";
export { readEnv, normalizeEnvironment, ENV_NAMES } from "./config/env.ts";

export {
	credentialsPath,
	loadCredentials,
	saveCredentials,
	clearCredentials,
} from "./credentials/store.ts";
export type { StoredCredentials, LoadedCredentials } from "./credentials/store.ts";

export { createRedactor } from "./redact.ts";
export type { Redactor } from "./redact.ts";
