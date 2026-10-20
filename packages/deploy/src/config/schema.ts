/**
 * Deploy configuration schema.
 *
 * The TypeBox object doubles as the JSON Schema shipped with the package
 * (`schema/vkma-deploy.config.schema.json`), so editor autocomplete and
 * runtime validation can never drift apart. A test asserts the committed
 * file matches `deployConfigJsonSchema()`.
 */

import { Type, type Static } from "@sinclair/typebox";
import {
	API_VERSION,
	DEFAULT_API_HOST,
	DEFAULT_OAUTH_HOST,
	DEFAULT_QUEUE_TIMEOUT_SEC,
	LEGACY_API_VERSION,
	OAUTH_CLIENT_ID,
} from "../constants.ts";

export const DeployConfigSchema = Type.Object(
	{
		// JSDoc here surfaces on `Static` property hovers (TypeBox keeps
		// doc comments through Static/Omit — verified with the TS 5.9
		// language service). The `description` options below feed the
		// shipped JSON Schema file; keep both in sync when editing.
		/** Allows `$schema` in JSON configs for autocomplete without failing validation. */
		$schema: Type.Optional(
			Type.String({ description: "JSON Schema reference for this file." }),
		),
		/** VK Mini App ID. Can also come from VKMA_APP_ID / MINI_APPS_APP_ID env. */
		appId: Type.Optional(
			Type.Integer({
				minimum: 1,
				description: "VK Mini App ID. Can also come from VKMA_APP_ID / MINI_APPS_APP_ID.",
			}),
		),
		/** Directory with the built app that gets zipped and uploaded, e.g. "./build".
		 * @remarks Legacy configs call this `static_path`. Required unless `bundle` is set. */
		staticPath: Type.Optional(
			Type.String({
				minLength: 1,
				description:
					'Directory with the built app that gets zipped and uploaded, e.g. "./build".',
			}),
		),
		/** Path to a prebuilt .zip archive; skips zipping.
		 * @remarks Mutually exclusive with `staticPath` (legacy: `bundleFile`). */
		bundle: Type.Optional(
			Type.String({
				minLength: 1,
				description:
					"Path to a prebuilt .zip archive. Skips zipping. Mutually exclusive with staticPath.",
			}),
		),
		/** Entry files per platform; at least one is required.
		 * @remarks VK does not process hosting tasks that carry no
		 * `endpoint_*` parameters: the task is created but the queue never
		 * delivers events (verified live). Only configured platforms are
		 * preflight-checked and sent; no defaults are injected. */
		endpoints: Type.Optional(
			Type.Object(
				{
					/** Entry file for the mobile app (iOS & Android). */
					mobile: Type.Optional(
						Type.String({
							minLength: 1,
							description: "Entry file for the mobile app (iOS & Android).",
						}),
					),
					/** Entry file for m.vk.ru. */
					mvk: Type.Optional(
						Type.String({ minLength: 1, description: "Entry file for m.vk.ru." }),
					),
					/** Entry file for vk.ru. */
					web: Type.Optional(
						Type.String({ minLength: 1, description: "Entry file for vk.ru." }),
					),
				},
				{
					additionalProperties: false,
					description:
						"Entry files per platform; at least one is required (VK does not process hosting tasks without endpoint_* parameters — the queue never delivers events). Only configured platforms are checked in preflight and sent; no defaults are injected.",
				},
			),
		),
		/** Which hosting environment to deploy to.
		 * @default "both" */
		environment: Type.Optional(
			Type.Union([Type.Literal("dev"), Type.Literal("production"), Type.Literal("both")], {
				description: 'Which hosting environment to deploy to. Default: "both".',
			}),
		),
		/** Switch production URLs to the new version.
		 * @default true
		 * @remarks Independent from `updateDev` (fixes upstream #118). */
		updateProd: Type.Optional(
			Type.Boolean({
				description: "Switch production URLs to the new version. Default: true.",
			}),
		),
		/** Switch dev URLs to the new version.
		 * @default true */
		updateDev: Type.Optional(
			Type.Boolean({ description: "Switch dev URLs to the new version. Default: true." }),
		),
		/** Deploy into a named test group instead of the common dev environment. */
		testGroupName: Type.Optional(
			Type.String({
				minLength: 1,
				description:
					"Deploy into a named test group instead of the common dev environment.",
			}),
		),
		/** VK access token.
		 * @remarks Prefer VKMA_ACCESS_TOKEN or `vkma-deploy login` over
		 * committing it to the config file. */
		accessToken: Type.Optional(
			Type.String({
				description:
					"VK access token. Prefer VKMA_ACCESS_TOKEN or `vkma-deploy login` over committing it.",
			}),
		),
		/** HTTP(S) proxy URL for all CLI network traffic.
		 * @remarks Precedence: `--proxy` flag > `HTTP(S)_PROXY` env > this
		 * field. Requires Node >= 22.21 / 24 (native env-proxy support);
		 * older runtimes warn and continue directly. `NO_PROXY` from the
		 * environment is always honored. Socks is not supported. */
		proxy: Type.Optional(
			Type.String({
				pattern: "^https?://",
				description:
					'HTTP(S) proxy URL for all CLI network traffic, e.g. "http://proxy.corp:8080". Precedence: --proxy flag > HTTP(S)_PROXY env > this field. Socks is not supported.',
			}),
		),
		/** VK API base URL.
		 * @default "https://api.vk.ru/method/" */
		apiHost: Type.Optional(
			Type.String({ default: DEFAULT_API_HOST, description: "VK API base URL." }),
		),
		/** VK OAuth base URL.
		 * @default "https://oauth.vk.ru/" */
		oauthHost: Type.Optional(
			Type.String({ default: DEFAULT_OAUTH_HOST, description: "VK OAuth base URL." }),
		),
		/** VK API version.
		 * @default "5.199"
		 * @remarks Set "5.131" for exact upstream compatibility. */
		apiVersion: Type.Optional(
			Type.String({
				default: API_VERSION,
				description: `VK API version. Default: "${API_VERSION}". Set "${LEGACY_API_VERSION}" for exact upstream compatibility.`,
			}),
		),
		/** OAuth client used by the device flow.
		 * @default 6670517 */
		oauthClientId: Type.Optional(
			Type.Integer({
				default: OAUTH_CLIENT_ID,
				description: "OAuth client used by the device flow.",
			}),
		),
		/** Max seconds to wait for the hosting queue before failing.
		 * @default 600
		 * @remarks Fixes the upstream infinite poll (#119); see also
		 * `--timeout` and VKMA_TIMEOUT. */
		queueTimeoutSec: Type.Optional(
			Type.Integer({
				minimum: 1,
				default: DEFAULT_QUEUE_TIMEOUT_SEC,
				description: "Max seconds to wait for the hosting queue before failing.",
			}),
		),
	},
	{
		// Strict: a misspelled field (e.g. static_path in a new-format file)
		// must fail validation naming the key, not silently deploy defaults.
		// `$schema` above stays whitelisted for JSON-editor autocomplete.
		additionalProperties: false,
		$schema: "https://json-schema.org/draft/2020-12/schema",
		$id: "https://unpkg.com/@vkma.dev/deploy/schema/vkma-deploy.config.schema.json",
		title: "vkma-deploy configuration",
		description: "Configuration for @vkma.dev/deploy (vkma-deploy).",
	},
);

/**
 * Shape accepted in config files, `defineDeployConfig`, and `deploy()`.
 * `$schema` is deliberately absent from the input type: it is JSON-editor
 * metadata, allowed (and stripped) only when loading JSON files.
 */
export type DeployConfigInput = Omit<Static<typeof DeployConfigSchema>, "$schema">;

/** Fully resolved configuration after defaults, env vars, and overrides. */
export interface ResolvedConfig {
	readonly appId: number;
	readonly staticPath?: string;
	readonly bundle?: string;
	readonly endpoints: Readonly<Partial<Record<"mobile" | "mvk" | "web", string>>>;
	readonly environment: "dev" | "production" | "both";
	readonly updateProd: boolean;
	readonly updateDev: boolean;
	readonly testGroupName?: string;
	readonly accessToken?: string;
	/** HTTP(S) proxy URL; activated by the CLI, inert data for the library. */
	readonly proxy?: string;
	readonly apiHost: string;
	readonly oauthHost: string;
	readonly apiVersion: string;
	readonly oauthClientId: number;
	readonly queueTimeoutSec: number;
}

/** Where each non-default value came from, reported by `vkma-deploy config`. */
export type ConfigSource = "config" | "env" | "override";

export interface ResolveResult {
	readonly config: ResolvedConfig;
	readonly meta: ResolvedConfigMeta;
}

export interface ResolvedConfigMeta {
	/** Config file that was loaded, if any. */
	readonly configPath?: string;
	/** True when the file was a legacy `vk-hosting-config.json`. */
	readonly legacy: boolean;
	/** Non-fatal notes: ignored legacy fields, unsupported options, etc. */
	readonly warnings: readonly string[];
	/** Field name -> where it came from. Absent fields use defaults. */
	readonly sources: Readonly<Partial<Record<keyof ResolvedConfig, ConfigSource>>>;
	/** True when `CI_URLS` is set: print machine-readable URL keys (upstream compat). */
	readonly ciUrls: boolean;
}

export const CONFIG_DEFAULTS = {
	apiHost: DEFAULT_API_HOST,
	oauthHost: DEFAULT_OAUTH_HOST,
	apiVersion: API_VERSION,
	oauthClientId: OAUTH_CLIENT_ID,
	queueTimeoutSec: DEFAULT_QUEUE_TIMEOUT_SEC,
	environment: "both" as const,
	updateProd: true,
	updateDev: true,
} as const;

/** Field names that hold secrets and must be redacted in `vkma-deploy config` output. */
export const SECRET_FIELDS: ReadonlySet<string> = new Set(["accessToken"]);

/**
 * Serializes the schema into a standalone JSON Schema document.
 * TypeBox symbols are dropped by JSON round-tripping, leaving plain JSON Schema.
 */
export function deployConfigJsonSchema(): Record<string, unknown> {
	return JSON.parse(JSON.stringify(DeployConfigSchema)) as Record<string, unknown>;
}
