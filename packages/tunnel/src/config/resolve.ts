/**
 * Config discovery and resolution.
 *
 * Discovery walks up from `cwd` (or the explicit `--config` path) and at
 * each directory checks `vkma-tunnel.config.{ts,mts,js,mjs,json}`. The
 * first file found wins and stops the search. There is deliberately no
 * merging between config files: one file is the whole truth.
 *
 * Layering: overrides (CLI flags / plugin options) > config file > defaults.
 * No environment layer by design: `OPENTUNNEL_API` is read natively by the
 * opentunnel client and `TUNNEL_TOKEN` by cloudflared itself.
 *
 * One section is merged key by key: a flag or plugin option that sets ONE
 * `cloudflared` key must not discard the rest of the file's section.
 */

import fs from "node:fs";
import path from "node:path";
import { Value } from "@sinclair/typebox/value";
import {
	CLOUDFLARED_PROVIDER,
	CONFIG_BASENAME,
	CONFIG_EXTENSIONS,
	DEFAULT_CLOUDFLARED_BINARY,
	DEFAULT_CLOUDFLARED_MODE,
	DEFAULT_CLOUDFLARED_PROTOCOL,
	DEFAULT_PROVIDER,
	DEFAULT_ROUTE,
} from "../constants.ts";
import { ConfigValidationError, TunnelError, type ConfigIssue } from "../errors.ts";
import { loadConfigFile, type LoadedConfigFile } from "./load.ts";
import {
	CONFIG_DEFAULTS,
	TunnelConfigSchema,
	type CloudflaredOptions,
	type ConfigSource,
	type ResolvedTunnelConfig,
	type ResolvedTunnelConfigMeta,
	type TunnelConfigInput,
} from "./schema.ts";

export interface ResolveTunnelConfigOptions {
	/** Directory to start discovery from. Default: `process.cwd()`. */
	readonly cwd?: string;
	/** Explicit config file path (`--config`); skips discovery. */
	readonly configPath?: string;
	/** Highest-precedence overrides (CLI flags, plugin options). */
	readonly overrides?: TunnelConfigInput;
}

export interface ResolveTunnelConfigResult {
	readonly config: ResolvedTunnelConfig;
	readonly meta: ResolvedTunnelConfigMeta;
}

/** Full candidate list in priority order; first existing file wins. */
export function configCandidates(): string[] {
	return CONFIG_EXTENSIONS.map(ext => `${CONFIG_BASENAME}.${ext}`);
}

/** Finds the config file for a directory by walking up to the filesystem root. */
export function findConfigFile(cwd: string): string | undefined {
	let dir = path.resolve(cwd);
	for (;;) {
		for (const candidate of configCandidates()) {
			const candidatePath = path.join(dir, candidate);
			if (fs.existsSync(candidatePath)) {
				return candidatePath;
			}
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			return undefined;
		}
		dir = parent;
	}
}

/**
 * Discovers, loads, merges, and validates the tunnel configuration.
 * Throws {@link ConfigValidationError} with every problem at once.
 */
export async function resolveTunnelConfig(
	options: ResolveTunnelConfigOptions = {},
): Promise<ResolveTunnelConfigResult> {
	const cwd = options.cwd ?? process.cwd();

	const file = await discoverAndLoad(options.configPath, cwd);
	const sources: Partial<Record<keyof ResolvedTunnelConfig, ConfigSource>> = {};

	// Merge layers: file, then overrides. Later layers win.
	const merged: Record<string, unknown> = { ...file?.config };
	// `$schema` is editor metadata, not config.
	delete merged["$schema"];
	if (file) {
		for (const key of Object.keys(file.config)) {
			if (key === "$schema") {
				continue;
			}
			sources[key as keyof ResolvedTunnelConfig] = "config";
		}
	}
	for (const [key, value] of Object.entries(options.overrides ?? {})) {
		if (value === undefined) {
			continue;
		}
		// Sections merge, scalars replace: `--cloudflared-mode token` must
		// not drop the hostname the config file set in the same section.
		if (key === "cloudflared" && isRecord(value)) {
			const fileSection = merged["cloudflared"];
			merged[key] = {
				...(isRecord(fileSection) ? fileSection : {}),
				...value,
			};
		} else {
			merged[key] = value;
		}
		sources[key as keyof ResolvedTunnelConfig] = "override";
	}

	const issues = [...collectSchemaIssues(merged), ...collectSemanticIssues(merged)];
	if (issues.length > 0) {
		throw new ConfigValidationError(issues);
	}

	const cloudflaredSection = merged["cloudflared"];
	const config: ResolvedTunnelConfig = {
		provider: (merged["provider"] as string | undefined) ?? CONFIG_DEFAULTS.provider,
		port: (merged["port"] as number | undefined) ?? CONFIG_DEFAULTS.port,
		host: (merged["host"] as string | undefined) ?? CONFIG_DEFAULTS.host,
		route: (merged["route"] as string | undefined) ?? CONFIG_DEFAULTS.route,
		profile: merged["profile"] as string | undefined,
		api: merged["api"] as string | undefined,
		cloudflared: isRecord(cloudflaredSection)
			? resolveCloudflared(cloudflaredSection)
			: undefined,
	};

	return {
		config,
		meta: {
			configPath: file?.path,
			sources,
		},
	};
}

async function discoverAndLoad(
	configPath: string | undefined,
	cwd: string,
): Promise<LoadedConfigFile | undefined> {
	if (configPath) {
		if (!fs.existsSync(configPath)) {
			throw new TunnelError("config", `Config file not found: ${configPath}`);
		}
		return loadConfigFile(configPath);
	}
	const found = findConfigFile(cwd);
	return found ? loadConfigFile(found) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Defaults for the `cloudflared` section (after schema validation). */
function resolveCloudflared(section: Record<string, unknown>): CloudflaredOptions {
	return {
		mode:
			(section["mode"] as CloudflaredOptions["mode"] | undefined) ?? DEFAULT_CLOUDFLARED_MODE,
		hostname: section["hostname"] as string | undefined,
		token: section["token"] as string | undefined,
		protocol:
			(section["protocol"] as CloudflaredOptions["protocol"] | undefined) ??
			DEFAULT_CLOUDFLARED_PROTOCOL,
		binary: (section["binary"] as string | undefined) ?? DEFAULT_CLOUDFLARED_BINARY,
	};
}

/**
 * Rules the schema cannot express: they relate two fields to each other.
 * Whether a token is PRESENT is checked where the environment is known
 * (the provider); here only the file and the overrides are.
 */
function collectSemanticIssues(data: Record<string, unknown>): ConfigIssue[] {
	const issues: ConfigIssue[] = [];
	const provider = (data["provider"] as string | undefined) ?? DEFAULT_PROVIDER;
	const section = data["cloudflared"];
	if (isRecord(section)) {
		if (provider !== CLOUDFLARED_PROVIDER) {
			issues.push({
				path: "cloudflared",
				message: `the cloudflared section needs ${JSON.stringify('provider: "cloudflared"')} — provider is ${JSON.stringify(provider)}`,
			});
		}
		if (section["mode"] === "token" && section["hostname"] === undefined) {
			issues.push({
				path: "cloudflared.hostname",
				message:
					'required when cloudflared.mode is "token": the public hostname configured in the dashboard',
			});
		}
	}
	if (
		provider === CLOUDFLARED_PROVIDER &&
		((data["route"] as string | undefined) ?? DEFAULT_ROUTE) !== DEFAULT_ROUTE
	) {
		issues.push({
			path: "route",
			message: "cloudflared serves one public hostname: route must be @",
		});
	}
	return issues;
}

function collectSchemaIssues(data: Record<string, unknown>): ConfigIssue[] {
	const issues: ConfigIssue[] = [];
	for (const error of Value.Errors(TunnelConfigSchema, data)) {
		issues.push({ path: error.path.replace(/^\//, "") || "(root)", message: error.message });
	}
	return dedupeIssues(issues);
}

function dedupeIssues(issues: ConfigIssue[]): ConfigIssue[] {
	const seen = new Set<string>();
	return issues.filter(issue => {
		const key = `${issue.path}:${issue.message}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}
