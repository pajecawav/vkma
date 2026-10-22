/**
 * CLI entry logic: command dispatch, event rendering, exit codes.
 *
 * Returns a process exit code instead of calling `process.exit`, so it is
 * testable. Exit codes:
 *   0 ok · 1 config/user · 2 network/timeout · 3 VK API · 130 aborted (SIGINT)
 */

import http from "node:http";
import pkg from "../../package.json";
import type { FetchLike } from "../api/client.ts";
import { loginDeviceFlow } from "../api/oauth.ts";
import { normalizeEnvironment } from "../config/env.ts";
import { resolveConfig } from "../config/resolve.ts";
import type { ConfigSource, ResolvedConfig, ResolvedConfigMeta } from "../config/schema.ts";
import {
	credentialsPath,
	clearCredentials,
	loadCredentials,
	saveCredentials,
} from "../credentials/store.ts";
import {
	deployResolved,
	type DeployEvent,
	type DeployOptions,
	type DeployResult,
} from "../deploy/flow.ts";
import type { QueueEvent } from "../deploy/queue.ts";
import { DeployError, isDeployError } from "../errors.ts";
import { paint } from "../logger/color.ts";
import { CliLogger, formatBytes, type LoggerMode } from "../logger/index.ts";
import { createRedactor } from "../redact.ts";
import { parseArgv, type ParsedArgs } from "./args.ts";
import { completionScript, COMPLETION_SHELLS } from "./completions.ts";
import { openUrl } from "./opener.ts";
import { confirm, text } from "./prompt.ts";
import { nativeSetGlobalProxyFromEnv, setupProxy } from "./proxy.ts";

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
	/** Proxy activation injection point (tests); defaults to Node's native
	 * `http.setGlobalProxyFromEnv` when the runtime provides it. */
	readonly setGlobalProxyFromEnv?: (envLike?: Record<string, string>) => unknown;
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
  --proxy <url>                    Route traffic through an HTTP(S) proxy
                                   (precedence: --proxy > HTTP(S)_PROXY env > config;
                                   NO_PROXY honored; needs Node 22.21+/24+)
  --update-prod / --no-update-prod Switch production URLs; when unset: asked
                                    on a TTY, required in non-interactive runs,
                                    VK server default with --yes/--dry-run
  --update-dev / --no-update-dev   Switch dev URLs (same unset rules as above)
  --dry-run                        Validate, zip, and stop before any network
  --interactive                    Fill missing values with prompts (TTY only)
  --yes, -y                        Skip the pre-deploy confirmation and the
                                   update-flag prompts (unset flags keep the
                                   VK server default; non-interactive runs
                                   still require explicit update flags).
                                   Prompts are also skipped for CI, non-TTY,
                                   --json/--quiet, --dry-run
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
				return await runLogin(parsed, { ...options, env, cwd, stdin, logger, mode, color });
			case "logout":
				return await runLogout({ env, logger });
			case "config":
				return await runConfig(parsed, { ...options, env, cwd, logger, mode, color });
			default:
				return await runDeploy(parsed, {
					...options,
					env,
					cwd,
					stdin,
					logger,
					mode,
					color,
				});
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
	readonly mode: LoggerMode;
	/** Colors resolved once in main() (TTY + pretty + NO_COLOR/--no-color). */
	readonly color: boolean;
}

async function runDeploy(parsed: ParsedArgs, context: RunContext): Promise<number> {
	const { logger, env, cwd, color } = context;
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

	// Route all CLI traffic through the configured proxy (flag > env >
	// config) before any network call happens.
	setupProxy(
		{ flagProxy: parsed.values.proxy, configProxy: config.proxy, env },
		logger,
		context.setGlobalProxyFromEnv ?? nativeSetGlobalProxyFromEnv()?.bind(http),
	);

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
	let effectiveConfig = config;
	if (parsed.booleans.interactive && stdin.isTTY === true && config.testGroupName === undefined) {
		const wantsGroup = await confirm("Deploy into a test group?", false, {
			signal: context.signal,
			stdin,
			input: context.input,
			output: context.stdout,
		});
		if (wantsGroup) {
			const name = await text("Test group name:", {
				signal: context.signal,
				stdin,
				input: context.input,
				output: context.stdout,
			});
			if (name !== "") {
				effectiveConfig = { ...config, testGroupName: name };
			}
		}
	}

	// Update-flag triage: explicit (config/env/flag) > TTY confirm > error.
	// Upstream's bin wrapper asks these questions unconditionally and then
	// clobbers explicit config values with the answers; here prompts fire
	// only for flags no layer provided, each answer is recorded as the
	// "prompt" source so it reaches the wire params, --yes/--dry-run keep
	// the VK server default, and non-interactive runs fail fast instead of
	// deploying on silently inherited server defaults.
	const prodUndecided = config.environment !== "dev" && meta.sources["updateProd"] === undefined;
	const devUndecided =
		config.environment !== "production" && meta.sources["updateDev"] === undefined;
	let effectiveMeta = meta;
	if (prodUndecided || devUndecided) {
		const interactiveRun =
			stdin.isTTY === true && context.mode === "pretty" && env["CI"] === undefined;
		if (!interactiveRun && !parsed.booleans.dryRun) {
			const hints = [
				prodUndecided ? "--update-prod or --no-update-prod" : undefined,
				devUndecided ? "--update-dev or --no-update-dev" : undefined,
			].filter((hint): hint is string => hint !== undefined);
			throw new DeployError(
				"user",
				`URL-switch policy is not set and this run is not interactive: pass ${hints.join(" and ")} (or set updateProd/updateDev in the config; legacy: update_prod/update_dev) — VK's server default must not decide whether live URLs switch`,
				{ code: "E_UPDATE_FLAG_REQUIRED" },
			);
		}
		// --yes/--dry-run keep the flags unset: prompts stay silent and the
		// plan reports the VK server default (upstream `noprompt` parity).
		if (interactiveRun && !parsed.booleans.yes && !parsed.booleans.dryRun) {
			const sources = { ...meta.sources };
			if (prodUndecided) {
				// Declining means "do not switch URLs" (update_prod=0), not
				// "cancel" — only the final Deploy? prompt cancels the run.
				// Yellow: the same caution color the logger uses for the
				// "production URLs will switch" warning — one semantic, and
				// the safe dev question stays neutral for contrast.
				effectiveConfig = {
					...effectiveConfig,
					updateProd: await confirm("Update production URLs?", true, {
						signal: context.signal,
						stdin,
						input: context.input,
						output: context.stdout,
						questionColor: color ? "yellow" : undefined,
					}),
				};
				sources["updateProd"] = "prompt";
			}
			if (devUndecided) {
				effectiveConfig = {
					...effectiveConfig,
					updateDev: await confirm("Update dev URLs?", true, {
						signal: context.signal,
						stdin,
						input: context.input,
						output: context.stdout,
					}),
				};
				sources["updateDev"] = "prompt";
			}
			effectiveMeta = { ...meta, sources };
		}
	}

	// Event 205 cannot be pre-configured: VK sends the confirmation code to
	// the developer mid-queue, so this prompt is unconditional for real
	// interactive terminals (AGENTS.md invariant #5) — no --interactive
	// required. Everything else fails fast with the queue's explanatory
	// user error instead of hanging on readline: non-TTY, --json/--quiet,
	// --yes, and CI runs — including pseudo-TTY CI (docker run -t and
	// friends), which used to block forever.
	const confirmCode =
		stdin.isTTY === true &&
		context.mode === "pretty" &&
		env["CI"] === undefined &&
		!parsed.booleans.yes
			? async () => {
					logger.spinnerStop();
					logger.info(
						"Please, confirm deploy on your phone (VK sent a confirmation code).",
					);
					const code = await text("Confirmation code:", {
						signal: context.signal,
						stdin,
						input: context.input,
						output: context.stdout,
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

	renderDeployPlan(logger, context.mode, effectiveConfig, effectiveMeta, color);

	// Pre-deploy confirmation: interactive humans get a last look at where
	// the deploy goes before anything leaves the machine. Auto-skipped for
	// --yes/--dry-run, CI (CI env var), non-TTY stdin, and json/quiet modes
	// (pipelines stay parseable).
	if (
		!parsed.booleans.yes &&
		context.mode === "pretty" &&
		stdin.isTTY === true &&
		env["CI"] === undefined &&
		!parsed.booleans.dryRun
	) {
		const proceed = await confirm("Deploy?", true, {
			signal: context.signal,
			stdin,
			input: context.input,
			output: context.stdout,
		});
		if (!proceed) {
			// A cancel, not an error: nothing was uploaded (exit 130).
			throw new DeployError("aborted", "Deploy canceled before upload", {
				code: "E_ABORTED",
			});
		}
	}

	const deployOptions: DeployOptions = {
		env,
		signal: context.signal,
		fetchImpl: context.fetchImpl,
		sleep: context.sleep,
		confirmCode,
		dryRun: parsed.booleans.dryRun,
		onEvent: event => renderDeployEvent(logger, event),
		onQueueEvent: event => renderQueueEvent(logger, event),
	};

	// The config is already resolved above; deployResolved skips the second
	// discovery + TS temp-file pass that deploy() would perform.
	const result = await deployResolved(
		{ config: effectiveConfig, meta: effectiveMeta },
		deployOptions,
		cwd,
	);
	if (parsed.booleans.dryRun) {
		logger.info("Dry run: no upload was performed.", { result });
	}
	return 0;
}

async function runLogin(parsed: ParsedArgs, context: RunContext): Promise<number> {
	const { logger, env, cwd } = context;
	const stdin = context.stdin ?? { isTTY: false };
	// Resolution demands neither deploy completeness nor appId — login
	// asks for the app itself, so a missing appId is a login concern:
	// --interactive prompts for it, everything else gets guidance.
	const { config } = await resolveConfig({
		cwd,
		configPath: parsed.values.config,
		env,
	});
	// Login talks to the OAuth endpoints — proxy routing applies here too.
	setupProxy(
		{ flagProxy: parsed.values.proxy, configProxy: config.proxy, env },
		logger,
		context.setGlobalProxyFromEnv ?? nativeSetGlobalProxyFromEnv()?.bind(http),
	);

	let appId = config.appId;
	if (!Number.isInteger(appId) || appId < 1) {
		if (parsed.booleans.interactive && stdin.isTTY === true) {
			const answer = await text("App ID to authorize:", {
				signal: context.signal,
				stdin,
				input: context.input,
				output: context.stdout,
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
			// rawOut: the confirm URL's single-use code= parameter must stay
			// readable; emit() would mask it via the redactor.
			logger.rawOut(
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
	// Read-only fallback is a public promise, so logout must not touch the
	// upstream vault — but silently still deploying with it after "logging
	// out" would be a trust trap, so say it out loud.
	const remaining = await loadCredentials(context.env);
	if (remaining?.source === "upstream-configstore") {
		context.logger.warn(
			"The upstream tool's token is still installed and remains usable as a fallback. Delete the upstream configstore vault to log out completely.",
		);
	}
	return 0;
}

async function runConfig(parsed: ParsedArgs, context: RunContext): Promise<number> {
	const { logger, env, cwd } = context;
	const { config, meta } = await resolveConfig({
		cwd,
		configPath: parsed.values.config,
		env,
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
		logger.info(
			`  ${key} = ${value === undefined ? "(unset)" : JSON.stringify(value)}${suffix}`,
		);
	}
	return 0;
}

/**
 * One URL-switch cell of the deploy plan: the value plus where it came
 * from, or the server default when no layer provided it. Color mirrors
 * the logger's semantics: a switching production target is a caution
 * (yellow), an undecided one is secondary info (dim).
 */
function urlSwitchLabel(
	value: boolean | undefined,
	source: ConfigSource | undefined,
	options: { color: boolean; caution: boolean },
): string {
	if (value === undefined) {
		return paint("server default", "dim", options.color);
	}
	const label = `${value ? "yes" : "no"}${source === undefined ? "" : ` (${source})`}`;
	return options.caution && value ? paint(label, "yellow", options.color) : label;
}

/**
 * Prints where the deploy is going — always logged (NDJSON event in json
 * mode), so pipelines can audit targets even though they skip the prompt.
 */
function renderDeployPlan(
	logger: CliLogger,
	mode: LoggerMode,
	config: ResolvedConfig,
	meta: ResolvedConfigMeta,
	color: boolean,
): void {
	const target =
		config.environment === "production"
			? "production"
			: config.environment === "dev"
				? "dev"
				: "production + dev";
	const endpoints = Object.entries(config.endpoints)
		.map(([platform, endpoint]) => `${platform}=${endpoint}`)
		.join(", ");
	const plan = {
		appId: config.appId,
		configPath: meta.configPath ?? null,
		environment: config.environment,
		updateProd: config.updateProd ?? null,
		updateDev: config.updateDev ?? null,
		testGroupName: config.testGroupName ?? null,
		bundle: config.bundle ?? config.staticPath ?? null,
		endpoints: config.endpoints,
	};
	if (mode === "json") {
		logger.info("deploy plan", { plan });
		return;
	}
	logger.info(
		[
			"Deploy plan:",
			`  app:        ${String(config.appId)}${meta.configPath === undefined ? "" : `  (${meta.configPath})`}`,
			`  target:     ${target}  (environment: ${config.environment})`,
			`  URL switch: prod ${urlSwitchLabel(config.updateProd, meta.sources["updateProd"], { color, caution: true })} · dev ${urlSwitchLabel(config.updateDev, meta.sources["updateDev"], { color, caution: false })}`,
			`  test group: ${config.testGroupName ?? "—"}`,
			`  bundle:     ${config.bundle ?? config.staticPath ?? "—"} · endpoints: ${endpoints}`,
		].join("\n"),
	);
	if (
		config.updateProd === true &&
		(config.environment === "production" || config.environment === "both")
	) {
		logger.warn("production URLs will switch to the new version");
	}
	// Only warn when every relevant switch is an explicit no — unset flags
	// may still switch URLs via the VK server default.
	const relevantSwitches = [
		config.environment !== "dev" ? config.updateProd : undefined,
		config.environment !== "production" ? config.updateDev : undefined,
	].filter((value): value is boolean => value !== undefined);
	if (relevantSwitches.length > 0 && relevantSwitches.every(value => value === false)) {
		logger.warn("no URLs will switch to the new version — the upload alone creates it");
	}
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
					: "Preflight passed (no endpoint files to check)",
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
			// Feedback while long-polling: without it the CLI looks hung
			// between task creation and the first queue event (a real-world
			// report confused this silence for a deadlock).
			logger.spinnerStart("Waiting for hosting queue…");
			break;
		case "deploy:success":
			logger.spinnerStop();
			renderSuccess(logger, event.result);
			break;
		case "http": {
			const part = event.event;
			if (part.kind === "request") {
				logger.debug(`${part.method ?? "GET"} ${part.url ?? ""}`.trim(), {
					request: part,
				});
			} else if (part.kind === "response") {
				const body = part.body === undefined ? "" : ` ${logger.redactString(part.body)}`;
				logger.debug(`← ${String(part.status ?? "?")}${body}`.trim(), {
					request: part,
				});
			} else {
				const attempt =
					part.attempt === undefined
						? ""
						: ` ${String(part.attempt)}/${String(part.maxAttempts ?? "?")}:`;
				logger.debug(`↻${attempt} ${part.error ?? ""}`.trim(), {
					request: part,
				});
			}
			break;
		}
	}
}

/** Stops the queue spinner for a print, resuming it if it was running. */
function pauseQueueSpinner(logger: CliLogger, print: () => void): void {
	const wasSpinning = logger.spinnerActive;
	logger.spinnerStop();
	print();
	if (wasSpinning) {
		logger.spinnerStart("Waiting for hosting queue…");
	}
}

function renderQueueEvent(logger: CliLogger, event: QueueEvent): void {
	if (event.urlUpdate !== undefined) {
		const update = event.urlUpdate;
		pauseQueueSpinner(logger, () => {
			logger.urlsBlock(update.isProduction ? "production" : "dev", update.urls);
		});
		return;
	}
	// 205 renders only after a successful apps.confirmDeploy — the prompt
	// already stopped the spinner, so resume it unconditionally.
	if (event.code === 205) {
		logger.spinnerStop();
		logger.info("Confirmation code accepted");
		logger.spinnerStart("Waiting for hosting queue…");
		return;
	}
	switch (event.code) {
		case 200:
			pauseQueueSpinner(logger, () => logger.info("Hosting reported deploy success"));
			break;
		case 202:
			logger.debug("Environment skipped by server");
			break;
		case 203:
			pauseQueueSpinner(logger, () =>
				logger.actionRequired("Confirm the deploy on your phone (push notification sent)"),
			);
			break;
		case 204:
			pauseQueueSpinner(logger, () => logger.step("Deploy confirmed"));
			break;
		case 206:
			if (event.testGroupUrl !== undefined) {
				const url = event.testGroupUrl;
				pauseQueueSpinner(logger, () => logger.info(`Test group URL: ${url}`));
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
