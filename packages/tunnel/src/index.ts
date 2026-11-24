/**
 * @vkma.dev/tunnel — public HTTPS tunnels for local VK Mini App servers.
 *
 * - `createTunnel()` — Node API (also the CLI/Vite-plugin core)
 * - `vkma-tunnel` CLI — run/reset/list/status (see `dist/cli.js`)
 * - `@vkma.dev/tunnel/vite` — `vkmaTunnel()` Vite plugin (dev + preview)
 */

export { createTunnel, getTunnelProvider, tunnelProviderIds } from "./core/tunnel.ts";
export { defaultProfile, sanitizeProfile, assertValidProfile } from "./core/profile.ts";
export {
	tunnelDataDir,
	profileFilePath,
	readProfileRecord,
	listProfileRecords,
	removeProfileRecord,
	removeAllProfileRecords,
	type ProfileRecord,
} from "./core/identity.ts";
export { defineTunnelConfig } from "./config/define.ts";
export { TUNNEL_PROVIDER_IDS, type TunnelProviderId } from "./constants.ts";
export {
	resolveTunnelConfig,
	findConfigFile,
	configCandidates,
	type ResolveTunnelConfigOptions,
	type ResolveTunnelConfigResult,
} from "./config/resolve.ts";
export {
	TunnelConfigSchema,
	tunnelConfigJsonSchema,
	CONFIG_DEFAULTS,
	type TunnelConfigInput,
	type ResolvedTunnelConfig,
	type ResolvedTunnelConfigMeta,
	type ConfigSource,
} from "./config/schema.ts";
export {
	TunnelError,
	ConfigValidationError,
	isTunnelError,
	toTunnelError,
	type TunnelErrorKind,
	type ConfigIssue,
} from "./errors.ts";
export type {
	TunnelEvent,
	TunnelStatus,
	TunnelHandle,
	TunnelProvider,
	TunnelProviderConnectOptions,
	TunnelProviderConnection,
	CreateTunnelOptions,
} from "./core/types.ts";
