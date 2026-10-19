/**
 * Deploy orchestration: config -> token -> preflight -> zip -> upload ->
 * create task -> wait for the hosting queue.
 *
 * This is the library core. It never touches `process`, never reads CLI
 * flags, and never calls `process.exit` — the CLI layer does all that.
 */

import fs from "node:fs/promises";
import { callApi, type FetchLike, type HttpOptions, type RequestEvent } from "../api/client.ts";
import { uploadBundle } from "../api/upload.ts";
import { resolveConfig } from "../config/resolve.ts";
import type {
	DeployConfigInput,
	ResolveResult,
	ResolvedConfig,
	ResolvedConfigMeta,
} from "../config/schema.ts";
import { ENV_BOTH, ENV_DEV, ENV_PRODUCTION } from "../constants.ts";
import { loadCredentials } from "../credentials/store.ts";
import { DeployError } from "../errors.ts";
import { preflight } from "../preflight.ts";
import { zipDirectory } from "../zip.ts";
import { waitForQueue, type QueueEvent } from "./queue.ts";

export type DeployInput = DeployConfigInput | string | undefined;

/** Transport knobs inherited by every network call `deploy()` makes. */
export interface DeployOptions {
	readonly cwd?: string;
	readonly configPath?: string;
	readonly env?: Record<string, string | undefined>;
	/** CLI-flag overrides (highest precedence). */
	readonly overrides?: DeployConfigInput;
	readonly confirmCode?: () => Promise<string>;
	readonly dryRun?: boolean;
	readonly onEvent?: (event: DeployEvent) => void;
	readonly onQueueEvent?: (event: QueueEvent) => void;
	readonly signal?: AbortSignal;
	readonly fetchImpl?: FetchLike;
	readonly maxAttempts?: number;
	readonly backoffBaseMs?: number;
	readonly sleep?: (ms: number) => Promise<void>;
}

export interface DeployResult {
	readonly dryRun: boolean;
	readonly appId: number;
	readonly environment: ResolvedConfig["environment"];
	readonly version?: number;
	readonly urls: { production?: Record<string, string>; dev?: Record<string, string> };
	readonly testGroupUrl?: string;
	readonly bundleBytes?: number;
	readonly bundleFiles?: number;
	readonly durationMs: number;
}

export type DeployEvent =
	| { type: "config:resolved"; config: ResolvedConfig; meta: ResolvedConfigMeta }
	| { type: "token:resolved"; source: "config" | "env" | "vkma" | "upstream-configstore" }
	| {
			type: "preflight:done";
			staticPath?: string;
			bundlePath?: string;
			endpointFiles: { platform: string; file: string }[];
	  }
	| { type: "zip:done"; bytes: number; archiveBytes: number; files: number }
	| { type: "upload:start"; total: number }
	| { type: "upload:progress"; sent: number; total: number }
	| { type: "upload:done" }
	| { type: "task:created"; version: number }
	| { type: "deploy:success"; result: DeployResult }
	| { type: "http"; event: RequestEvent };

function environmentBitmask(environment: ResolvedConfig["environment"]): number {
	switch (environment) {
		case "dev":
			return ENV_DEV;
		case "production":
			return ENV_PRODUCTION;
		default:
			return ENV_BOTH;
	}
}

function buildTaskParams(
	config: ResolvedConfig,
	sources: ResolvedConfigMeta["sources"],
): Record<string, string | number> {
	const params: Record<string, string | number> = {
		app_id: config.appId,
		environment: environmentBitmask(config.environment),
	};
	if (config.testGroupName !== undefined) {
		params["test_group_name"] = config.testGroupName;
	}
	// Upstream parity ('update_prod' in cfg): the flags are sent only when
	// explicitly set — via config file, env var, or CLI flag. Absent flags
	// fall back to VK server defaults instead of pinning 1/1.
	if (sources["updateProd"] !== undefined) {
		params["update_prod"] = config.updateProd ? 1 : 0;
	}
	if (sources["updateDev"] !== undefined) {
		params["update_dev"] = config.updateDev ? 1 : 0;
	}
	// Upstream parity: endpoint_* params exist only for configured platforms.
	for (const [platform, endpoint] of Object.entries(config.endpoints)) {
		params[`endpoint_${platform}`] = endpoint;
	}
	return params;
}

async function resolveToken(
	config: ResolvedConfig,
	meta: ResolvedConfigMeta,
	env: Record<string, string | undefined>,
	onEvent?: (event: DeployEvent) => void,
): Promise<string> {
	if (config.accessToken !== undefined && config.accessToken !== "") {
		const source = meta.sources["accessToken"] === "env" ? "env" : "config";
		onEvent?.({ type: "token:resolved", source });
		return config.accessToken;
	}
	const stored = await loadCredentials(env);
	if (stored !== undefined) {
		onEvent?.({
			type: "token:resolved",
			source: stored.source === "vkma" ? "vkma" : "upstream-configstore",
		});
		return stored.accessToken;
	}
	throw new DeployError(
		"user",
		'No access token. Run "vkma-deploy login", set VKMA_ACCESS_TOKEN (legacy: MINI_APPS_ACCESS_TOKEN), or put accessToken in the config.',
		{ code: "E_NO_TOKEN" },
	);
}

/**
 * Runs a deploy. Accepts:
 * - `undefined` — discover the config from `options.cwd` (default: cwd)
 * - a directory path — discover from there
 * - a config object — use it directly (env vars still apply on top, exactly
 *   like a discovered config file)
 */
export async function deploy(
	input?: DeployInput,
	options: DeployOptions = {},
): Promise<DeployResult> {
	const cwd = typeof input === "string" ? input : (options.cwd ?? process.cwd());
	const resolved = await resolveConfig({
		cwd,
		configPath: options.configPath,
		env: options.env,
		overrides: typeof input === "object" && input !== null ? input : options.overrides,
	});
	return deployResolved(resolved, options, cwd);
}

/**
 * Runs a deploy from an already-resolved configuration. The CLI resolves
 * once for logging and passes the result here — a second discovery pass
 * (and a second TS temp-file round-trip) per deploy is pure waste.
 */
export async function deployResolved(
	resolved: ResolveResult,
	options: DeployOptions = {},
	cwd: string = process.cwd(),
): Promise<DeployResult> {
	const startedAt = Date.now();
	const { config, meta } = resolved;
	options.onEvent?.({ type: "config:resolved", config, meta });

	const env = options.env ?? process.env;
	const preflightResult = await preflight(config, cwd);
	options.onEvent?.({
		type: "preflight:done",
		staticPath: preflightResult.staticPath,
		bundlePath: preflightResult.bundlePath,
		endpointFiles: preflightResult.endpointFiles.map(({ platform, file }) => ({
			platform,
			file,
		})),
	});

	let archive: Uint8Array;
	if (preflightResult.bundlePath !== undefined) {
		const file = await fs.readFile(preflightResult.bundlePath);
		archive = new Uint8Array(file);
		options.onEvent?.({
			type: "zip:done",
			bytes: archive.length,
			archiveBytes: archive.length,
			files: 1,
		});
	} else {
		const zipped = await zipDirectory(preflightResult.staticPath as string);
		archive = zipped.archive;
		options.onEvent?.({
			type: "zip:done",
			bytes: zipped.bytes,
			archiveBytes: archive.length,
			files: zipped.files,
		});
	}

	if (options.dryRun === true) {
		return {
			dryRun: true,
			appId: config.appId,
			environment: config.environment,
			urls: {},
			bundleBytes: archive.length,
			bundleFiles: preflightResult.bundlePath !== undefined ? 1 : undefined,
			durationMs: Date.now() - startedAt,
		};
	}

	const accessToken = await resolveToken(config, meta, env, options.onEvent);

	const httpOptions: HttpOptions & { fetchImpl?: FetchLike } = {
		signal: options.signal,
		onEvent:
			options.onEvent === undefined
				? undefined
				: event => options.onEvent?.({ type: "http", event }),
		fetchImpl: options.fetchImpl,
		maxAttempts: options.maxAttempts,
		backoffBaseMs: options.backoffBaseMs,
		sleep: options.sleep,
	};

	const taskParams = buildTaskParams(config, meta.sources);
	const uploadServer = await callApi("apps.getGoHostingUploadServer", taskParams, {
		...httpOptions,
		accessToken,
		apiHost: config.apiHost,
		apiVersion: config.apiVersion,
	});
	const uploadUrl = uploadServer["upload_url"];
	if (typeof uploadUrl !== "string" || uploadUrl === "") {
		throw new DeployError("api", "VK did not return an upload_url", {
			code: "E_NO_UPLOAD_URL",
			details: uploadServer,
		});
	}

	options.onEvent?.({ type: "upload:start", total: archive.length });
	const uploadResponse = await uploadBundle(uploadUrl, archive, {
		...httpOptions,
		onProgress: (sent, total) => options.onEvent?.({ type: "upload:progress", sent, total }),
	});
	options.onEvent?.({ type: "upload:done" });

	const uploadResponseB64 = Buffer.from(JSON.stringify(uploadResponse), "utf8").toString(
		"base64",
	);
	const task = await callApi(
		"apps.createGoHostingTask",
		{ ...taskParams, upload_response: uploadResponseB64 },
		{ ...httpOptions, accessToken, apiHost: config.apiHost, apiVersion: config.apiVersion },
	);
	const version = task["version"];
	if (typeof version !== "number") {
		throw new DeployError("api", "VK did not return a task version", {
			code: "E_NO_VERSION",
			details: task,
		});
	}
	options.onEvent?.({ type: "task:created", version });

	const queue = await waitForQueue({
		...httpOptions,
		accessToken,
		apiHost: config.apiHost,
		apiVersion: config.apiVersion,
		appId: config.appId,
		version,
		timeoutMs: config.queueTimeoutSec * 1000,
		environments: {
			dev: config.environment === "dev" || config.environment === "both",
			production: config.environment === "production" || config.environment === "both",
		},
		confirmCode: options.confirmCode,
		onQueueEvent: options.onQueueEvent,
	});

	const result: DeployResult = {
		dryRun: false,
		appId: config.appId,
		environment: config.environment,
		version,
		urls: queue.urls,
		testGroupUrl: queue.testGroupUrl,
		bundleBytes: archive.length,
		durationMs: Date.now() - startedAt,
	};
	options.onEvent?.({ type: "deploy:success", result });
	return result;
}
