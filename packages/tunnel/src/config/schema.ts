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
	DEFAULT_CLOUDFLARED_BINARY,
	DEFAULT_CLOUDFLARED_MODE,
	DEFAULT_CLOUDFLARED_PROTOCOL,
	DEFAULT_HOST,
	DEFAULT_PORT,
	DEFAULT_PROVIDER,
	DEFAULT_ROUTE,
	HOSTNAME_PATTERN,
	TUNNEL_PROVIDER_IDS,
	type TunnelProviderId,
	PROFILE_PATTERN,
	ROUTE_PATTERN,
} from "../constants.ts";

/**
 * Options of the `cloudflared` provider (DESIGN.md). Every key is optional
 * and has a default; `mode` and `protocol` are enumerated so a typo is a
 * validation error, not a silent fallback.
 */
export const CloudflaredOptionsSchema = Type.Object(
	{
		mode: Type.Optional(
			Type.Union([Type.Literal("quick"), Type.Literal("token")], {
				default: DEFAULT_CLOUDFLARED_MODE,
				description:
					'"quick": a one-time trycloudflare.com URL without an account — the hostname changes on every start. "token": a named tunnel created in the Cloudflare dashboard, stable hostname.',
			}),
		),
		/** Token mode: the dashboard's public hostname for this tunnel. */
		hostname: Type.Optional(
			Type.String({
				pattern: HOSTNAME_PATTERN.source,
				maxLength: 253,
				description:
					'Token mode: the public hostname configured in the dashboard for this tunnel, e.g. "app.example.com".',
			}),
		),
		/** Token mode: the dashboard's tunnel token. */
		token: Type.Optional(
			Type.String({
				minLength: 1,
				description:
					"Token mode: the dashboard's tunnel token. Prefer the TUNNEL_TOKEN environment variable — never commit a token.",
			}),
		),
		protocol: Type.Optional(
			Type.Union([Type.Literal("http2"), Type.Literal("quic")], {
				default: DEFAULT_CLOUDFLARED_PROTOCOL,
				description:
					'Transport to the Cloudflare edge. "http2" (default) also works where UDP 7844 is blocked; "quic" is faster but keeps dying on such networks.',
			}),
		),
		binary: Type.Optional(
			Type.String({
				minLength: 1,
				default: DEFAULT_CLOUDFLARED_BINARY,
				description:
					'The cloudflared executable: a name looked up on PATH (default "cloudflared") or an absolute path.',
			}),
		),
	},
	{
		additionalProperties: false,
		description:
			'Options of the cloudflared provider; only meaningful with provider: "cloudflared".',
	},
);

/**
 * Options of the `opentunnel` provider.
 *
 * The top level holds what EVERY provider understands (`provider`, `port`,
 * `host`, `profile`); whatever belongs to one provider lives in its
 * section. A config then never carries a key the chosen provider would
 * silently ignore — and a section beside another provider's id is a
 * validation error, not a dead key.
 */
export const OpentunnelOptionsSchema = Type.Object(
	{
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
		/** Self-hosted opentunnel API endpoint.
		 * @remarks The `OPENTUNNEL_API` env var works too (read natively by
		 * the opentunnel client). */
		api: Type.Optional(
			Type.String({
				pattern: "^https?://",
				description:
					'API endpoint of a self-hosted opentunnel server, e.g. "https://opentunnel.example". Optional; the opentunnel client also honors the OPENTUNNEL_API env var.',
			}),
		),
	},
	{
		additionalProperties: false,
		description:
			'Options of the opentunnel provider; only meaningful with provider: "opentunnel".',
	},
);

export const TunnelConfigSchema = Type.Object(
	{
		/** Allows `$schema` in JSON configs for autocomplete without failing validation. */
		$schema: Type.Optional(
			Type.String({ description: "JSON Schema reference for this file." }),
		),
		/**
		 * Tunnel provider, enumerated from `TUNNEL_PROVIDER_IDS`: a typo is a
		 * config error with the valid values named, not a string that fails
		 * later at connect time.
		 * @default "opentunnel"
		 */
		provider: Type.Optional(
			Type.Union(
				TUNNEL_PROVIDER_IDS.map(id => Type.Literal(id)),
				{
					default: DEFAULT_PROVIDER,
					description:
						'Tunnel provider: "opentunnel" (default) or "cloudflared" (needs the cloudflared binary on PATH; see the `cloudflared` section).',
				},
			),
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
		 * @default "localhost" */
		host: Type.Optional(
			Type.String({
				minLength: 1,
				default: DEFAULT_HOST,
				description:
					'Local host the tunnel forwards to. Default: "localhost" (resolves to ::1 or 127.0.0.1 — vite preview often binds IPv6 only).',
			}),
		),
		/** Identity-store profile: the name of the stored tunnel record, whichever provider wrote it.
		 * Defaults to the project directory name. A stable profile means a stable public URL across runs. */
		profile: Type.Optional(
			Type.String({
				pattern: PROFILE_PATTERN.source,
				minLength: 1,
				maxLength: 64,
				description:
					"Identity-store profile: the name of the stored tunnel record, whichever provider wrote it. Defaults to the project directory name. A stable profile keeps the public URL stable across runs (reset with `vkma-tunnel reset`).",
			}),
		),
		/** Options of the `opentunnel` provider; only meaningful with `provider: "opentunnel"`. */
		opentunnel: Type.Optional(OpentunnelOptionsSchema),
		/** Options of the `cloudflared` provider; only meaningful with `provider: "cloudflared"`. */
		cloudflared: Type.Optional(CloudflaredOptionsSchema),
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

/** The `opentunnel` section as accepted (every key optional; the provider applies the defaults). */
export type OpentunnelOptionsInput = Static<typeof OpentunnelOptionsSchema>;

/** The `cloudflared` section as accepted (every key optional). */
export type CloudflaredOptionsInput = Static<typeof CloudflaredOptionsSchema>;

/** The `cloudflared` section after defaults. */
export interface CloudflaredOptions {
	readonly mode: "quick" | "token";
	readonly hostname?: string;
	readonly token?: string;
	readonly protocol: "http2" | "quic";
	readonly binary: string;
}

/** Fully resolved configuration after defaults and overrides. */
export interface ResolvedTunnelConfig {
	readonly provider: TunnelProviderId;
	readonly port: number;
	readonly host: string;
	readonly profile?: string;
	/**
	 * A provider's section is present only when the config file or an
	 * override set it; the provider applies its own defaults.
	 */
	readonly opentunnel?: OpentunnelOptionsInput;
	readonly cloudflared?: CloudflaredOptions;
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
} as const;

/**
 * Serializes the schema into a standalone JSON Schema document.
 * TypeBox symbols are dropped by JSON round-tripping, leaving plain JSON Schema.
 */
export function tunnelConfigJsonSchema(): Record<string, unknown> {
	return JSON.parse(JSON.stringify(TunnelConfigSchema)) as Record<string, unknown>;
}
