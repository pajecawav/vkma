/**
 * Config discovery and resolution.
 *
 * Discovery walks up from `cwd` (or the explicit `--config` path) and at each
 * directory checks, in order: `vkma-deploy.config.{ts,mts,js,mjs,json}`, then
 * the legacy `vk-hosting-config.json`. The first file found wins and stops the
 * search — the closest file beats the file type. There is deliberately no
 * merging between config files: one file is the whole truth.
 *
 * Layering: CLI overrides > environment variables > config file > defaults.
 */

import fs from "node:fs";
import path from "node:path";
import { Value } from "@sinclair/typebox/value";
import { ConfigValidationError, DeployError, type ConfigIssue } from "../errors.ts";
import { readEnv } from "./env.ts";
import { configCandidates, loadConfigFile, type LoadedConfigFile } from "./load.ts";
import {
	CONFIG_DEFAULTS,
	DeployConfigSchema,
	type ConfigSource,
	type DeployConfigInput,
	type ResolveResult,
	type ResolvedConfig,
} from "./schema.ts";

export interface ResolveConfigOptions {
	/** Directory to start discovery from. Default: `process.cwd()`. */
	readonly cwd?: string;
	/** Explicit config file path (`--config`); skips discovery. */
	readonly configPath?: string;
	/** Environment snapshot; pass a fake in tests. Default: `process.env`. */
	readonly env?: Record<string, string | undefined>;
	/** Highest-precedence overrides (CLI flags). */
	readonly overrides?: DeployConfigInput;
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
 * Discovers, loads, merges, and validates the deploy configuration.
 * Throws {@link ConfigValidationError} with every problem at once.
 */
export async function resolveConfig(options: ResolveConfigOptions = {}): Promise<ResolveResult> {
	const env = options.env ?? process.env;
	const cwd = options.cwd ?? process.cwd();

	const file = await discoverAndLoad(options.configPath, cwd);
	const warnings = [...(file?.warnings ?? [])];
	const sources: Partial<Record<keyof ResolvedConfig, ConfigSource>> = {};

	const { overrides: envOverrides, ciUrls } = readEnv(env);

	// Merge layers: file, then env, then CLI overrides. Later layers win.
	const merged: Record<string, unknown> = { ...file?.config };
	if (file) {
		for (const key of Object.keys(file.config)) {
			sources[key as keyof ResolvedConfig] = "config";
		}
	}
	for (const [key, value] of Object.entries(envOverrides)) {
		if (value !== undefined) {
			merged[key] = value;
			sources[key as keyof ResolvedConfig] = "env";
		}
	}
	for (const [key, value] of Object.entries(options.overrides ?? {})) {
		if (value !== undefined) {
			merged[key] = value;
			sources[key as keyof ResolvedConfig] = "override";
		}
	}

	// `$schema` is editor metadata, not config.
	delete merged["$schema"];

	const issues = collectSchemaIssues(merged);
	if (issues.length > 0) {
		throw new ConfigValidationError(issues);
	}

	const config: ResolvedConfig = {
		appId: merged["appId"] as number,
		// Whitespace-only paths normalize to unset — an empty staticPath must
		// never resolve to cwd and zip the whole project.
		staticPath: normalizeMaybePath(merged["staticPath"] as string | undefined) || undefined,
		bundle: normalizeMaybePath(merged["bundle"] as string | undefined) || undefined,
		endpoints: (merged["endpoints"] as Partial<Record<"mobile" | "mvk" | "web", string>>) ?? {},
		environment:
			(merged["environment"] as ResolvedConfig["environment"]) ?? CONFIG_DEFAULTS.environment,
		updateProd: (merged["updateProd"] as boolean | undefined) ?? CONFIG_DEFAULTS.updateProd,
		updateDev: (merged["updateDev"] as boolean | undefined) ?? CONFIG_DEFAULTS.updateDev,
		testGroupName: merged["testGroupName"] as string | undefined,
		accessToken: merged["accessToken"] as string | undefined,
		proxy: merged["proxy"] as string | undefined,
		apiHost: (merged["apiHost"] as string | undefined) ?? CONFIG_DEFAULTS.apiHost,
		oauthHost: (merged["oauthHost"] as string | undefined) ?? CONFIG_DEFAULTS.oauthHost,
		apiVersion: (merged["apiVersion"] as string | undefined) ?? CONFIG_DEFAULTS.apiVersion,
		oauthClientId:
			(merged["oauthClientId"] as number | undefined) ?? CONFIG_DEFAULTS.oauthClientId,
		queueTimeoutSec:
			(merged["queueTimeoutSec"] as number | undefined) ?? CONFIG_DEFAULTS.queueTimeoutSec,
	};

	validateCrossFields(config);

	return {
		config,
		meta: {
			configPath: file?.path,
			legacy: file?.legacy ?? false,
			warnings,
			sources,
			ciUrls,
		},
	};
}

async function discoverAndLoad(
	configPath: string | undefined,
	cwd: string,
): Promise<LoadedConfigFile | undefined> {
	if (configPath) {
		if (!fs.existsSync(configPath)) {
			throw new DeployError("config", `Config file not found: ${configPath}`);
		}
		return loadConfigFile(configPath);
	}
	const found = findConfigFile(cwd);
	return found ? loadConfigFile(found) : undefined;
}

function collectSchemaIssues(data: Record<string, unknown>): ConfigIssue[] {
	const issues: ConfigIssue[] = [];
	for (const error of Value.Errors(DeployConfigSchema, data)) {
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

function validateCrossFields(config: ResolvedConfig): void {
	const issues: ConfigIssue[] = [];

	if (config.testGroupName !== undefined && config.environment === "production") {
		issues.push({
			path: "testGroupName",
			message:
				'test groups only exist for the dev environment; use environment "dev" or "both"',
		});
	}
	if (issues.length > 0) {
		throw new ConfigValidationError(issues);
	}
}

export interface ReadinessHints {
	/** A legacy (vk-hosting-config.json) file was discovered. */
	readonly legacy?: boolean;
	/** Directory discovery started from — used in the no-config hint. */
	readonly cwd?: string;
	/** Whether any config file was discovered. */
	readonly hasConfigFile?: boolean;
	/** Path of the discovered config file, when there is one. */
	readonly configPath?: string;
}

/**
 * Operation readiness for the deploy flow. appId presence belongs here,
 * not in resolution: `login` demands it too, but on its own terms (an
 * interactive prompt or login-specific guidance). Resolution stays
 * consumer-agnostic; the deploy contract — a deployable bundle and the
 * app to deploy it to — is enforced here at the mouth of the flow.
 */
export function assertDeployReadiness(config: ResolvedConfig, hints: ReadinessHints = {}): void {
	const issues: ConfigIssue[] = [];
	const legacyHint = hints.legacy === true ? " (upstream: static_path)" : "";

	if (!config.appId || config.appId < 1) {
		issues.push({
			path: "appId",
			message:
				hints.hasConfigFile === false
					? `appId is required: no config file found${hints.cwd === undefined ? "" : ` (looked up from ${hints.cwd})`} — create vkma-deploy.config.json, e.g. { "appId": 123, "staticPath": "./build", "endpoints": { "web": "index.html" } }, or set env VKMA_APP_ID / MINI_APPS_APP_ID`
					: `appId is required: set it in the config file${hints.configPath === undefined ? "" : ` (${hints.configPath})`}, or via env VKMA_APP_ID / MINI_APPS_APP_ID`,
		});
	}
	if (config.staticPath !== undefined && config.bundle !== undefined) {
		issues.push({
			path: "staticPath / bundle",
			message:
				"staticPath and bundle are mutually exclusive: pass either a directory to zip or a prebuilt archive",
		});
	}
	if (config.staticPath === undefined && config.bundle === undefined) {
		issues.push({
			path: "staticPath",
			message: `staticPath is required when bundle is not set${legacyHint}: e.g. "./build"`,
		});
	}
	if (Object.keys(config.endpoints).length === 0) {
		issues.push({
			path: "endpoints",
			message:
				'at least one platform is required, e.g. { "endpoints": { "web": "index.html" } } — VK does not process hosting tasks without endpoint_* parameters, so the deploy would hang forever',
		});
	}
	if (issues.length > 0) {
		throw new ConfigValidationError(issues);
	}
}

/** Strips a trailing slash so endpoint paths don't double up (upstream issues #18/#31). */
function normalizeMaybePath(value: string | undefined): string | undefined {
	if (value === undefined) {
		return undefined;
	}
	const trimmed = value.trim();
	return trimmed.endsWith("/") && trimmed.length > 1 ? trimmed.slice(0, -1) : trimmed;
}
