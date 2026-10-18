/**
 * CLI entry logic: command dispatch, event rendering, exit codes.
 *
 * Returns a process exit code instead of calling `process.exit`, so it is
 * testable. Exit codes:
 *   0 ok · 1 config/user · 2 network/timeout · 3 VK API · 130 aborted (SIGINT)
 */

import pkg from "../../package.json";
import type { FetchLike } from "../api/client.ts";
import { loginDeviceFlow } from "../api/oauth.ts";
import { normalizeEnvironment } from "../config/env.ts";
import { resolveConfig } from "../config/resolve.ts";
import type { ResolvedConfig, ResolvedConfigMeta } from "../config/schema.ts";
import {
	credentialsPath,
	clearCredentials,
	loadCredentials,
	saveCredentials,
} from "../credentials/store.ts";
import { deploy, type DeployEvent, type DeployOptions, type DeployResult } from "../deploy/flow.ts";
import type { QueueEvent } from "../deploy/queue.ts";
import { DeployError, isDeployError } from "../errors.ts";
import { CliLogger, formatBytes } from "../logger/index.ts";
import { createRedactor } from "../redact.ts";
import { parseArgv, type ParsedArgs } from "./args.ts";
import { completionScript, COMPLETION_SHELLS } from "./completions.ts";
import { openUrl } from "./opener.ts";
import { confirm, text } from "./prompt.ts";

const VERSION = pkg.version;

export interface MainOptions {
	readonly env?: Record<string, string | undefined>;
	readonly cwd?: string;
	readonly stdout?: { write(text: string): void; isTTY?: boolean };
	readonly stderr?: { write(text: string): void };
	readonly stdin?: { isTTY?: boolean };
	/** Prompt input stream injection (tests); defaults to process.stdin. */
	readonly input?: NodeJS.ReadableStream;
	readonly signal?: AbortSignal;
	readonly fetchImpl?: FetchLike;
	readonly sleep?: (ms: number) => Promise<void>;
	/** Browser opener injection point for tests; default opens a real tab. */
	readonly openUrl?: (url: string) => void;
}

const HELP = `vkma-deploy — deploy VK Mini Apps hosting (${VERSION})

Usage:
  vkma-deploy [deploy] [flags]     Deploy the app (default command)
  vkma-deploy login                Authorize via browser, store the token
  vkma-deploy logout               Remove stored credentials
  vkma-deploy config               Print the resolved configuration
  vkma-deploy completions <shell>  Print shell completion (bash|zsh|fish)

Flags:
  --env <dev|production|both>      Target environment (default: both)
  --config <path>                  Explicit config file (skips discovery)
  --timeout <sec>                  Hosting queue deadline (default: 600)
  --test-group <name>              Deploy into a test group
  --update-prod / --no-update-prod Switch production URLs (default: update)
  --update-dev / --no-update-dev   Switch dev URLs (default: update)
  --dry-run                        Validate, zip, and stop before any network
  --interactive                    Fill missing values with prompts (TTY only)
  --json                           Machine-readable newline-delimited events
  --verbose, -v                    Debug output incl. HTTP requests (redacted)
  --quiet, -q                      Errors only
  --no-color                       Disable colors (also honors NO_COLOR)
  --help, -h / --version, -V

Config discovery (first found wins, walking up from cwd):
  vkma-deploy.config.{ts,mts,js,mjs,json}   preferred
  vk-hosting-config.json                    legacy upstream format

Env: VKMA_ACCESS_TOKEN, VKMA_APP_ID, VKMA_ENVIRONMENT, VKMA_TEST_GROUP,
     VKMA_TIMEOUT (+ legacy MINI_APPS_*, CI_URLS aliases)

Exit codes: 0 ok · 1 config/user · 2 network/timeout · 3 VK API · 130 aborted
Docs: https://github.com/vkma-dev/vkma (packages/deploy)`;

export async function main(argv: readonly string[], options: MainOptions = {}): Promise<number> {
	const env = options.env ?? process.env;
	const cwd = options.cwd ?? process.cwd();
	const stdout = options.stdout ?? process.stdout;
	const stderr = options.stderr ?? process.stderr;
	const stdin = options.stdin ?? process.stdin;

	const parsed = parseArgv(argv);
	if (parsed.errors.length > 0) {
		for (const error of parsed.errors) {
			stderr.write(`error: ${error}\n`);
		}
		stderr.write("Run vkma-deploy --help for usage.\n");
		return 1;
	}
	if (parsed.booleans.help || parsed.command === "help") {
		stdout.write(`${HELP}\n`);
		return 0;
	}
	if (parsed.booleans.version || parsed.command === "version") {
		stdout.write(`${VERSION}\n`);
		return 0;
	}
	if (parsed.command === "completions") {
		const shell = parsed.shell ?? "";
		if (!(COMPLETION_SHELLS as readonly string[]).includes(shell)) {
			stderr.write(`error: expected a shell argument: ${COMPLETION_SHELLS.join("|")}\n`);
			return 1;
		}
		stdout.write(completionScript(shell));
		return 0;
	}

	const mode = parsed.booleans.json ? "json" : parsed.booleans.quiet ? "quiet" : "pretty";
	const level = parsed.booleans.quiet ? "error" : parsed.booleans.verbose ? "debug" : "info";
	// Machine-readable output must never contain ANSI escapes, even when
	// stdout is a TTY (logger.step paints before emit; CI parsers choke).
	const color =
		mode !== "json" &&
		!parsed.booleans.noColor &&
		env["NO_COLOR"] === undefined &&
		stdout.isTTY === true;
	const logger = new CliLogger({
		mode,
		color,
		level,
		redactor: createRedactor(),
		stdout,
		stderr,
	});

	try {
		switch (parsed.command) {
			case "login":
				return await runLogin(parsed, { ...options, env, cwd, stdin, logger });
			case "logout":
				return await runLogout({ env, logger });
			case "config":
				return await runConfig(parsed, { ...options, env, cwd, logger });
			default:
				return await runDeploy(parsed, { ...options, env, cwd, stdin, logger });
		}
	} catch (error) {
		logger.fail(error, parsed.booleans.verbose);
		return isDeployError(error) ? error.exitCode : 1;
	} finally {
		logger.dispose();
	}
}

interface RunContext extends MainOptions {
	readonly env: Record<string, string | undefined>;
	readonly cwd: string;
	readonly logger: CliLogger;
}

async function runDeploy(parsed: ParsedArgs, context: RunContext): Promise<number> {
	const { logger, env, cwd } = context;
	const stdin = context.stdin ?? { isTTY: false };
	const overrides: Record<string, unknown> = {};
	if (parsed.values.env !== undefined) {
		overrides["environment"] = normalizeEnvironment(parsed.values.env);
	}
	if (parsed.values.testGroup !== undefined) {
		overrides["testGroupName"] = parsed.values.testGroup;
	}
	if (parsed.values.timeout !== undefined) {
		overrides["queueTimeoutSec"] = parsed.values.timeout;
	}
	if (parsed.booleans.updateProd !== undefined) {
		overrides["updateProd"] = parsed.booleans.updateProd;
	}
	if (parsed.booleans.updateDev !== undefined) {
		overrides["updateDev"] = parsed.booleans.updateDev;
	}

	const { config, meta } = await resolveConfig({
		cwd,
		configPath: parsed.values.config,
		env,
		overrides,
	});
	logger.setCiUrls(meta.ciUrls);

	// Defense in depth: register every token this run may print so the
	// redactor's exact-value layer is live, not just the regex layer.
	if (config.accessToken !== undefined && config.accessToken !== "") {
		logger.addSecret(config.accessToken);
	}
	const stored = await loadCredentials(env);
	if (stored !== undefined) {
		logger.addSecret(stored.accessToken);
	}

	// --interactive fills only what is still missing; it never overrides an
	// explicit flag, env var, or config value.
	const finalOverrides: Record<string, unknown> = { ...overrides };
	if (parsed.booleans.interactive && stdin.isTTY === true && config.testGroupName === undefined) {
		const wantsGroup = await confirm("Deploy into a test group?", false, {
			signal: context.signal,
			stdin,
			input: context.input,
		});
		if (wantsGroup) {
			const name = await text("Test group name:", {
				signal: context.signal,
				stdin,
				input: context.input,
			});
			if (name !== "") {
				finalOverrides["testGroupName"] = name;
			}
		}
	}

	const confirmCode =
		parsed.booleans.interactive && stdin.isTTY === true
			? async () => {
					const code = await text("Confirmation code (sent by VK):", {
						signal: context.signal,
						stdin,
						input: context.input,
					});
					if (code === "") {
						// An empty answer means the user refuses to continue —
						// a cancel, not a config problem (exit 130).
						throw new DeployError(
							"aborted",
							"Confirmation code declined — deploy canceled (event 205)",
							{ code: "E_ABORTED" },
						);
					}
					return code;
				}
			: undefined;

	const deployOptions: DeployOptions = {
		cwd,
		configPath: parsed.values.config,
		env,
		signal: context.signal,
		fetchImpl: context.fetchImpl,
		sleep: context.sleep,
		confirmCode,
		dryRun: parsed.booleans.dryRun,
		overrides: finalOverrides,
		onEvent: event => renderDeployEvent(logger, event),
		onQueueEvent: event => renderQueueEvent(logger, event),
	};

	const result = await deploy(undefined, deployOptions);
	if (parsed.booleans.dryRun) {
		logger.info("Dry run: no upload was performed.", { result });
	}
	return 0;
}

async function runLogin(parsed: ParsedArgs, context: RunContext): Promise<number> {
	const { logger, env, cwd } = context;
	const stdin = context.stdin ?? { isTTY: false };
	const { config } = await resolveConfig({
		cwd,
		configPath: parsed.values.config,
		env,
	});

	let appId = config.appId;
	if (!Number.isInteger(appId) || appId < 1) {
		if (parsed.booleans.interactive && stdin.isTTY === true) {
			const answer = await text("App ID to authorize:", {
				signal: context.signal,
				stdin,
				input: context.input,
			});
			appId = Number.parseInt(answer, 10);
		}
		if (!Number.isInteger(appId) || appId < 1) {
			throw new DeployError(
				"user",
				"appId is required for login: set it in the config or VKMA_APP_ID, or run with --interactive.",
				{
					code: "E_NO_APP_ID",
				},
			);
		}
	}

	const result = await loginDeviceFlow({
		appId,
		oauthHost: config.oauthHost,
		oauthClientId: config.oauthClientId,
		signal: context.signal,
		fetchImpl: context.fetchImpl,
		sleep: context.sleep,
		onAuthUrl: url =>
			logger.info(
				`Open this URL to authorize vkma-deploy (browser should open automatically):\n  ${url}`,
			),
		// The browser opens only in interactive runs; CI/tests/pipe stdin
		// just get the printed URL.
		openBrowser: stdin.isTTY === true ? (context.openUrl ?? openUrl) : undefined,
	});

	const savedTo = await saveCredentials(
		{ accessToken: result.accessToken, expiresIn: result.expiresIn },
		env,
	);
	logger.addSecret(result.accessToken);
	logger.step(`Token saved to ${savedTo}`);
	logger.info("Credentials file is mode 0600. For CI use the VKMA_ACCESS_TOKEN env variable.");
	return 0;
}

async function runLogout(context: {
	env: Record<string, string | undefined>;
	logger: CliLogger;
}): Promise<number> {
	const removed = await clearCredentials(context.env);
	if (removed) {
		context.logger.step(`Removed ${credentialsPath(context.env)}`);
	} else {
		context.logger.info(`No stored credentials at ${credentialsPath(context.env)}`);
	}
	return 0;
}

async function runConfig(parsed: ParsedArgs, context: RunContext): Promise<number> {
	const { logger, env, cwd } = context;
	const { config, meta } = await resolveConfig({
		cwd,
		configPath: parsed.values.config,
		env,
		overrides: parsed.booleans.dryRun ? {} : undefined,
	});

	const safeConfig = {
		...config,
		accessToken: config.accessToken !== undefined ? "***" : undefined,
	};
	if (parsed.booleans.json) {
		logger.info("config", { config: safeConfig, meta });
		return 0;
	}

	const origin = meta.configPath ?? "no config file (defaults + env)";
	logger.info(`Config: ${origin}${meta.legacy ? " [legacy vk-hosting-config.json]" : ""}`);
	if (meta.ciUrls) {
		logger.info("CI_URLS is set: URL output uses raw keys");
	}
	const stored = await loadCredentials(env);
	logger.info(
		stored === undefined
			? "Token: none stored (run vkma-deploy login)"
			: `Token: stored (${stored.source === "vkma" ? "vkma credentials" : "upstream configstore fallback"})`,
	);
	for (const warning of meta.warnings) {
		logger.warn(warning);
	}
	for (const [key, value] of Object.entries(safeConfig)) {
		const source = meta.sources[key as keyof ResolvedConfig];
		const suffix = source === undefined ? "" : `  (${source})`;
		logger.info(`  ${key} = ${JSON.stringify(value)}${suffix}`);
	}
	return 0;
}

function renderResolve(logger: CliLogger, _config: ResolvedConfig, meta: ResolvedConfigMeta): void {
	for (const warning of meta.warnings) {
		logger.warn(warning);
	}
	logger.debug(
		meta.configPath === undefined
			? "No config file found; using env + defaults"
			: `Using config file: ${meta.configPath}`,
	);
}

function renderDeployEvent(logger: CliLogger, event: DeployEvent): void {
	switch (event.type) {
		case "config:resolved":
			renderResolve(logger, event.config, event.meta);
			break;
		case "token:resolved": {
			const labels: Record<string, string> = {
				env: "environment variable",
				config: "config file",
				vkma: "vkma credentials store",
				"upstream-configstore": "upstream configstore (drop-in fallback)",
			};
			logger.info(`Access token: ${labels[event.source] ?? event.source}`);
			break;
		}
		case "preflight:done":
			logger.step(
				event.endpointFiles.length > 0
					? `Preflight passed (${event.endpointFiles.length} endpoint files checked)`
					: "Preflight passed (no endpoint checks — server defaults apply)",
			);
			break;
		case "zip:done":
			logger.step(
				`Bundle: ${formatBytes(event.archiveBytes)} zip (${formatBytes(event.bytes)} sources, ${event.files} files)`,
			);
			break;
		case "upload:start":
			logger.spinnerStart(`Uploading bundle (${formatBytes(event.total)})`);
			break;
		case "upload:progress":
			logger.progress(event.sent, event.total);
			break;
		case "upload:done":
			logger.spinnerStop();
			logger.step("Bundle uploaded");
			break;
		case "task:created":
			logger.info(`Hosting task created (version ${String(event.version)})`);
			break;
		case "deploy:success":
			renderSuccess(logger, event.result);
			break;
		case "http": {
			const part = event.event;
			const suffix = part.body === undefined ? "" : `\n${logger.redactString(part.body)}`;
			logger.debug(
				`${part.method ?? "GET"} ${part.url ?? ""} -> ${String(part.status ?? "")}${suffix}`.trim(),
				{
					request: part,
				},
			);
			break;
		}
	}
}

function renderQueueEvent(logger: CliLogger, event: QueueEvent): void {
	if (event.urlUpdate !== undefined) {
		logger.urlsBlock(event.urlUpdate.isProduction ? "production" : "dev", event.urlUpdate.urls);
		return;
	}
	switch (event.code) {
		case 200:
			logger.info("Hosting reported deploy success");
			break;
		case 202:
			logger.debug("Environment skipped by server");
			break;
		case 203:
			logger.info("Confirm the deploy on your phone (push notification sent)");
			break;
		case 204:
			logger.step("Deploy confirmed");
			break;
		case 205:
			logger.info("VK sent a confirmation code");
			break;
		case 206:
			if (event.testGroupUrl !== undefined) {
				logger.info(`Test group URL: ${event.testGroupUrl}`);
			}
			break;
		default:
			logger.debug(`Queue event ${String(event.code)}`);
	}
}

function renderSuccess(logger: CliLogger, result: DeployResult): void {
	if (result.dryRun) {
		logger.step(
			`Dry run OK: bundle ${formatBytes(result.bundleBytes ?? 0)} is ready (no network calls were made)`,
		);
		return;
	}
	logger.emit({
		level: "info",
		event: "deploy:success",
		message: "Deploy finished",
		data: result,
	});
	logger.step(
		`Deploy complete: version ${String(result.version)} in ${(result.durationMs / 1000).toFixed(1)}s`,
	);
	if (result.testGroupUrl !== undefined) {
		logger.info(`Test group URL: ${result.testGroupUrl}`);
	}
}
