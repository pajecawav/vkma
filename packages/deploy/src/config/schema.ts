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
		/** Allows `$schema` in JSON configs for autocomplete without failing validation. */
		$schema: Type.Optional(
			Type.String({ description: "JSON Schema reference for this file." }),
		),
		appId: Type.Optional(
			Type.Integer({
				minimum: 1,
				description: "VK Mini App ID. Can also come from VKMA_APP_ID / MINI_APPS_APP_ID.",
			}),
		),
		staticPath: Type.Optional(
			Type.String({
				minLength: 1,
				description:
					'Directory with the built app that gets zipped and uploaded, e.g. "./build".',
			}),
		),
		bundle: Type.Optional(
			Type.String({
				minLength: 1,
				description:
					"Path to a prebuilt .zip archive. Skips zipping. Mutually exclusive with staticPath.",
			}),
		),
		endpoints: Type.Optional(
			Type.Partial(
				Type.Object({
					mobile: Type.String({
						description: "Entry file for the mobile app (iOS & Android).",
					}),
					mvk: Type.String({ description: "Entry file for m.vk.ru." }),
					web: Type.String({ description: "Entry file for vk.ru." }),
				}),
				{
					description:
						'Entry files per platform. Missing platforms default to "index.html".',
				},
			),
		),
		environment: Type.Optional(
			Type.Union([Type.Literal("dev"), Type.Literal("production"), Type.Literal("both")], {
				description: 'Which hosting environment to deploy to. Default: "both".',
			}),
		),
		updateProd: Type.Optional(
			Type.Boolean({
				description: "Switch production URLs to the new version. Default: true.",
			}),
		),
		updateDev: Type.Optional(
			Type.Boolean({ description: "Switch dev URLs to the new version. Default: true." }),
		),
		testGroupName: Type.Optional(
			Type.String({
				minLength: 1,
				description:
					"Deploy into a named test group instead of the common dev environment.",
			}),
		),
		accessToken: Type.Optional(
			Type.String({
				description:
					"VK access token. Prefer VKMA_ACCESS_TOKEN or `vkma-deploy login` over committing it.",
			}),
		),
		apiHost: Type.Optional(
			Type.String({ default: DEFAULT_API_HOST, description: "VK API base URL." }),
		),
		oauthHost: Type.Optional(
			Type.String({ default: DEFAULT_OAUTH_HOST, description: "VK OAuth base URL." }),
		),
		apiVersion: Type.Optional(
			Type.String({
				default: API_VERSION,
				description: `VK API version. Default: "${API_VERSION}". Set "${LEGACY_API_VERSION}" for exact upstream compatibility.`,
			}),
		),
		oauthClientId: Type.Optional(
			Type.Integer({
				default: OAUTH_CLIENT_ID,
				description: "OAuth client used by the device flow.",
			}),
		),
		queueTimeoutSec: Type.Optional(
			Type.Integer({
				minimum: 1,
				default: DEFAULT_QUEUE_TIMEOUT_SEC,
				description: "Max seconds to wait for the hosting queue before failing.",
			}),
		),
	},
	{
		$schema: "https://json-schema.org/draft/2020-12/schema",
		$id: "https://unpkg.com/@vkma.dev/deploy/schema/vkma-deploy.config.schema.json",
		title: "vkma-deploy configuration",
		description: "Configuration for @vkma.dev/deploy (vkma-deploy).",
	},
);

/** Shape accepted in config files, `defineDeployConfig`, and `deploy()`. */
export type DeployConfigInput = Static<typeof DeployConfigSchema>;

/** Fully resolved configuration after defaults, env vars, and overrides. */
export interface ResolvedConfig {
	readonly appId: number;
	readonly staticPath?: string;
	readonly bundle?: string;
	readonly endpoints: Readonly<{ mobile: string; mvk: string; web: string }>;
	readonly environment: "dev" | "production" | "both";
	readonly updateProd: boolean;
	readonly updateDev: boolean;
	readonly testGroupName?: string;
	readonly accessToken?: string;
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

const DEFAULT_ENDPOINTS = { mobile: "index.html", mvk: "index.html", web: "index.html" } as const;

export const CONFIG_DEFAULTS = {
	apiHost: DEFAULT_API_HOST,
	oauthHost: DEFAULT_OAUTH_HOST,
	apiVersion: API_VERSION,
	oauthClientId: OAUTH_CLIENT_ID,
	queueTimeoutSec: DEFAULT_QUEUE_TIMEOUT_SEC,
	endpoints: DEFAULT_ENDPOINTS,
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
