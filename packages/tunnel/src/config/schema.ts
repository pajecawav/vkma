/**
 * Tunnel configuration schema.
 *
 * The TypeBox object doubles as the JSON Schema shipped with the package
 * (`schema/vkma-tunnel.config.schema.json`), so editor autocomplete and
 * runtime validation can never drift apart. A test asserts the committed
 * file matches `tunnelConfigJsonSchema()`.
 *
 * Deliberately minimal (design decision): exactly what a tunnel run needs.
 * Convenience flags (QR, open) are CLI/plugin options, not config fields.
 */

import { Type, type Static } from "@sinclair/typebox";
import {
	DEFAULT_HOST,
	DEFAULT_PORT,
	DEFAULT_PROVIDER,
	DEFAULT_ROUTE,
	PROFILE_PATTERN,
	ROUTE_PATTERN,
} from "../constants.ts";

export const TunnelConfigSchema = Type.Object(
	{
		/** Allows `$schema` in JSON configs for autocomplete without failing validation. */
		$schema: Type.Optional(
			Type.String({ description: "JSON Schema reference for this file." }),
		),
		/** Tunnel provider. v0.1 ships `opentunnel` only.
		 * @default "opentunnel" */
		provider: Type.Optional(
			Type.String({
				minLength: 1,
				default: DEFAULT_PROVIDER,
				description: 'Tunnel provider. v0.1 supports "opentunnel" only.',
			}),
		),
		/** Local port to expose through the tunnel.
		 * @default 5173 */
		port: Type.Optional(
			Type.Integer({
				minimum: 1,
				maximum: 65535,
				default: DEFAULT_PORT,
				description: "Local port to expose through the tunnel. Default: 5173.",
			}),
		),
		/** Local host the tunnel forwards to.
		 * @default "127.0.0.1" */
		host: Type.Optional(
			Type.String({
				minLength: 1,
				default: DEFAULT_HOST,
				description:
					'Local host the tunnel forwards to. Default: "localhost" (resolves to ::1 or 127.0.0.1 — vite preview often binds IPv6 only).',
			}),
		),
		/** Route name: `@` (the tunnel hostname itself) or a subdomain label.
		 * @default "@" */
		route: Type.Optional(
			Type.String({
				pattern: ROUTE_PATTERN.source,
				default: DEFAULT_ROUTE,
				description:
					'Route name: "@" (apex, https://<id>.opentunnel.xyz) or a lowercase DNS label for a subdomain. Default: "@".',
			}),
		),
		/** Identity-store profile; defaults to the project directory name.
		 * A stable profile means a stable public URL across runs. */
		profile: Type.Optional(
			Type.String({
				pattern: PROFILE_PATTERN.source,
				minLength: 1,
				maxLength: 64,
				description:
					"Identity-store profile. Defaults to the project directory name. A stable profile keeps the public URL stable across runs (reset with `vkma-tunnel reset`).",
			}),
		),
		/** Self-hosted opentunnel API endpoint (provider-specific).
		 * @remarks The `OPENTUNNEL_API` env var works too (read natively by
		 * the opentunnel client). */
		api: Type.Optional(
			Type.String({
				pattern: "^https?://",
				description:
					'Provider API endpoint for self-hosted servers, e.g. "https://opentunnel.example". Optional; the opentunnel client also honors the OPENTUNNEL_API env var.',
			}),
		),
	},
	{
		// Strict: a misspelled field must fail validation naming the key,
		// not silently tunnel on defaults.
		additionalProperties: false,
		$schema: "https://json-schema.org/draft/2020-12/schema",
		$id: "https://unpkg.com/@vkma.dev/tunnel/schema/vkma-tunnel.config.schema.json",
		title: "vkma-tunnel configuration",
		description: "Configuration for @vkma.dev/tunnel (vkma-tunnel).",
	},
);

/**
 * Shape accepted in config files, `defineTunnelConfig`, and `createTunnel`.
 * `$schema` is deliberately absent from the input type: it is JSON-editor
 * metadata, allowed (and stripped) only when loading JSON files.
 */
export type TunnelConfigInput = Omit<Static<typeof TunnelConfigSchema>, "$schema">;

/** Fully resolved configuration after defaults and overrides. */
export interface ResolvedTunnelConfig {
	readonly provider: string;
	readonly port: number;
	readonly host: string;
	readonly route: string;
	readonly profile?: string;
	readonly api?: string;
}

/** Where each non-default value came from, for status output. */
export type ConfigSource = "config" | "override";

export interface ResolvedTunnelConfigMeta {
	/** Config file that was loaded, if any. */
	readonly configPath?: string;
	/** Field name -> where it came from. Absent fields use defaults. */
	readonly sources: Readonly<Partial<Record<keyof ResolvedTunnelConfig, ConfigSource>>>;
}

export const CONFIG_DEFAULTS = {
	provider: DEFAULT_PROVIDER,
	port: DEFAULT_PORT,
	host: DEFAULT_HOST,
	route: DEFAULT_ROUTE,
} as const;

/**
 * Serializes the schema into a standalone JSON Schema document.
 * TypeBox symbols are dropped by JSON round-tripping, leaving plain JSON Schema.
 */
export function tunnelConfigJsonSchema(): Record<string, unknown> {
	return JSON.parse(JSON.stringify(TunnelConfigSchema)) as Record<string, unknown>;
}
