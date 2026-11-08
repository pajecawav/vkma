/**
 * `vkma-deploy init`: scaffold `vkma-deploy.config.ts` in the cwd.
 *
 * The wizard is the fourth TTY-only prompt exception (invariant #5): init
 * exists to ask, so on a real terminal it prompts for whatever the flags
 * and the legacy config left missing, shows the exact file, and confirms
 * before writing. Non-TTY runs never prompt: values come from flags, and
 * a missing appId is a hard `E_NO_TTY` error carrying a ready-to-paste
 * example, so CI cannot hang on readline.
 *
 * Precedence mirrors resolution: flags > legacy `vk-hosting-config.json`
 * (cwd only, never walked up) > init defaults. The legacy `access_token`
 * is deliberately NOT carried into the new file: a token belongs in the
 * credentials store (`vkma-deploy login`), not in a file users commit.
 */

import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { Value } from "@sinclair/typebox/value";
import { normalizeEnvironment } from "../config/env.ts";
import { LEGACY_CONFIG_FILENAME, mapLegacyConfig } from "../config/legacy.ts";
import { CONFIG_BASENAME, CONFIG_EXTENSIONS, loadConfigFile } from "../config/load.ts";
import { DeployConfigSchema, type DeployConfigInput } from "../config/schema.ts";
import { ConfigValidationError, DeployError } from "../errors.ts";
import type { ParsedArgs } from "./args.ts";
import { promptWithStatus, type RunContext } from "./main.ts";
import { confirm, text, type PromptOptions } from "./prompt.ts";

/** Where init writes; the only filename it ever produces. */
const OUTPUT_FILENAME = `${CONFIG_BASENAME}.ts`;

const INIT_DEFAULTS = {
	staticPath: "./dist",
	entryFile: "index.html",
	environment: "both",
} as const;

/** Config values init is willing to persist, in output order. */
interface InitValues {
	appId: number;
	/** Exactly one of staticPath/bundle is written; bundle only from legacy. */
	staticPath?: string;
	bundle?: string;
	endpoints: Partial<Record<"mobile" | "mvk" | "web", string>>;
	environment: "dev" | "production" | "both";
	testGroupName?: string;
	apiHost?: string;
	oauthHost?: string;
}

export async function runInit(
	parsed: ParsedArgs,
	context: RunContext,
	login: () => Promise<number>,
): Promise<number> {
	const { logger, env, cwd, status } = context;
	const stdin = context.stdin ?? { isTTY: false };
	status.working("Preparing the config scaffold");
	// Same interactivity gate as the deploy prompts: TTY + pretty + no CI.
	const interactiveRun =
		stdin.isTTY === true && context.mode === "pretty" && env["CI"] === undefined;

	if (parsed.values.config !== undefined) {
		throw new DeployError(
			"user",
			`init writes ${OUTPUT_FILENAME} in the current directory; --config is not supported`,
			{ code: "E_CONFIG_FLAG" },
		);
	}

	await assertNoExistingConfig(cwd);

	// Legacy import: cwd only. A parent-directory legacy file belongs to
	// another project; discovery during deploy will find it anyway.
	const legacy = await readLegacyConfig(cwd, logger);

	const values = interactiveRun
		? await promptWithStatus(status, "question", "Answering the init wizard", () =>
				composeValues(parsed, legacy, {
					interactiveRun,
					stdin,
					signal: context.signal,
					input: context.input,
					output: context.stdout,
				}),
			)
		: await composeValues(parsed, legacy, {
				interactiveRun,
				stdin,
				signal: context.signal,
				input: context.input,
				output: context.stdout,
			});

	const content = renderConfigFile(values);

	// A last look at the exact bytes before they land on disk.
	if (interactiveRun && !parsed.booleans.yes) {
		logger.info(content.trimEnd());
		const proceed = await promptWithStatus(
			status,
			"question",
			`Review the proposed ${OUTPUT_FILENAME} bytes`,
			() =>
				confirm(`Write ${OUTPUT_FILENAME}?`, true, {
					signal: context.signal,
					stdin,
					input: context.input,
					output: context.stdout,
				}),
		);
		if (!proceed) {
			// A cancel, not an error: nothing was written (exit 130).
			throw new DeployError("aborted", "init canceled before writing", {
				code: "E_ABORTED",
			});
		}
	}

	await fs.writeFile(path.join(cwd, OUTPUT_FILENAME), content, "utf8");
	status.done(`Created ${OUTPUT_FILENAME}`);
	logger.step(`Created ${OUTPUT_FILENAME}`);

	await warnWhenPackageMissing(cwd, logger);

	// The login offer is a TTY-only convenience; CI gets the manual command.
	if (interactiveRun && !parsed.booleans.yes) {
		const wantsLogin = await promptWithStatus(
			status,
			"question",
			"Authorize now (vkma-deploy login)?",
			() =>
				confirm("Authorize now (vkma-deploy login)?", false, {
					signal: context.signal,
					stdin,
					input: context.input,
					output: context.stdout,
				}),
		);
		if (wantsLogin) {
			// runLogin re-resolves the config from cwd and finds the file we
			// just wrote; its own exit code becomes init's.
			return await login();
		}
	}
	logger.info("Next: npx vkma-deploy login, then npx vkma-deploy to deploy.");
	return 0;
}

/** Any existing vkma-deploy.config.* in the cwd blocks init. */
async function assertNoExistingConfig(cwd: string): Promise<void> {
	for (const ext of CONFIG_EXTENSIONS) {
		const candidate = path.join(cwd, `${CONFIG_BASENAME}.${ext}`);
		if (!existsSync(candidate)) {
			continue;
		}
		// Best-effort placeholder detection: an unloadable existing config
		// still blocks init, it just does not qualify for the create-app hint.
		let placeholder = false;
		try {
			const loaded = await loadConfigFile(candidate);
			placeholder = loaded.config.appId === 0;
		} catch {
			placeholder = false;
		}
		const hint = placeholder
			? " — it looks like a create-app scaffold with appId: 0: put your real app id into that file instead of generating a new one"
			: "";
		throw new DeployError(
			"config",
			`${path.basename(candidate)} already exists in ${cwd}${hint}`,
			{ code: "E_CONFIG_EXISTS" },
		);
	}
}

/**
 * Reads and maps `vk-hosting-config.json` from the cwd when present.
 * Mapping failures are hard errors: init cannot silently guess which
 * legacy values were valid.
 */
async function readLegacyConfig(
	cwd: string,
	logger: RunContext["logger"],
): Promise<DeployConfigInput> {
	const legacyPath = path.join(cwd, LEGACY_CONFIG_FILENAME);
	if (!existsSync(legacyPath)) {
		return {};
	}
	let raw: unknown;
	try {
		raw = JSON.parse(await fs.readFile(legacyPath, "utf8"));
	} catch (cause) {
		throw new DeployError(
			"config",
			`Cannot read ${LEGACY_CONFIG_FILENAME}: ${(cause as Error).message}`,
			{ cause },
		);
	}
	let mapped: ReturnType<typeof mapLegacyConfig>;
	try {
		mapped = mapLegacyConfig(raw);
	} catch (cause) {
		throw new DeployError(
			"config",
			`Invalid ${LEGACY_CONFIG_FILENAME}: ${(cause as Error).message}`,
			{ cause },
		);
	}
	for (const warning of mapped.warnings) {
		logger.warn(warning);
	}
	if (mapped.config.accessToken !== undefined) {
		logger.warn(
			`access_token from ${LEGACY_CONFIG_FILENAME} was not copied into ${OUTPUT_FILENAME}: run vkma-deploy login instead of committing a token`,
		);
	}
	return mapped.config;
}

interface ComposePromptDeps {
	readonly interactiveRun: boolean;
	readonly stdin: { isTTY?: boolean };
	readonly signal?: AbortSignal;
	readonly input?: NodeJS.ReadableStream;
	readonly output?: { write(text: string): void };
}

/** Required input: re-asks until it parses; Ctrl+C stays the exit. */
async function promptAppId(options: PromptOptions): Promise<number> {
	for (;;) {
		const answer = await text("App ID (dev.vk.com/admin/apps-list):", options);
		const parsed = Number.parseInt(answer, 10);
		if (Number.isInteger(parsed) && parsed >= 1 && String(parsed) === answer.trim()) {
			return parsed;
		}
	}
}

/** flags > legacy > defaults, prompting (TTY) only for what is still missing. */
async function composeValues(
	parsed: ParsedArgs,
	legacy: DeployConfigInput,
	deps: ComposePromptDeps,
): Promise<InitValues> {
	const promptOptions = {
		signal: deps.signal,
		stdin: deps.stdin,
		input: deps.input,
		output: deps.output,
	};

	const provided = parsed.values.appId ?? legacy.appId;
	let appId: number;
	if (provided !== undefined && provided >= 1) {
		appId = provided;
	} else if (deps.interactiveRun) {
		appId = await promptAppId(promptOptions);
	} else {
		throw noTtyAppIdError(parsed);
	}

	let environment: InitValues["environment"] = INIT_DEFAULTS.environment;
	if (parsed.values.env !== undefined) {
		try {
			environment = normalizeEnvironment(parsed.values.env);
		} catch (cause) {
			throw new DeployError("user", (cause as Error).message, { cause });
		}
	}

	// endpoints: an explicit platform list wins wholesale (entry files
	// default to index.html), then legacy entries, then all three.
	let endpoints: InitValues["endpoints"];
	if (parsed.values.endpoints !== undefined) {
		endpoints = Object.fromEntries(
			parsed.values.endpoints.map(platform => [platform, INIT_DEFAULTS.entryFile]),
		);
	} else if (legacy.endpoints !== undefined && Object.keys(legacy.endpoints).length > 0) {
		endpoints = legacy.endpoints;
	} else {
		endpoints = {
			mobile: INIT_DEFAULTS.entryFile,
			mvk: INIT_DEFAULTS.entryFile,
			web: INIT_DEFAULTS.entryFile,
		};
	}

	const values: InitValues = {
		appId,
		endpoints,
		environment,
	};
	// A --static-path flag beats a legacy bundle; otherwise a legacy bundle
	// replaces staticPath entirely (they are mutually exclusive on the wire).
	if (parsed.values.staticPath !== undefined) {
		values.staticPath = parsed.values.staticPath;
	} else if (legacy.bundle !== undefined) {
		values.bundle = legacy.bundle;
	} else {
		values.staticPath = legacy.staticPath ?? INIT_DEFAULTS.staticPath;
	}
	// Legacy-only extras, written exactly when the legacy file had them.
	if (legacy.testGroupName !== undefined) {
		values.testGroupName = legacy.testGroupName;
	}
	if (legacy.apiHost !== undefined) {
		values.apiHost = legacy.apiHost;
	}
	if (legacy.oauthHost !== undefined) {
		values.oauthHost = legacy.oauthHost;
	}

	// The written file must pass the same validation a deploy would run
	// on it; a garbage legacy endpoints block fails here, not mid-deploy.
	const issues = [...Value.Errors(DeployConfigSchema, values)].map(error => ({
		path: error.path.replace(/^\//, "") || "(root)",
		message: error.message,
	}));
	if (issues.length > 0) {
		throw new ConfigValidationError(issues);
	}
	return values;
}

/** The non-TTY appId failure: both escape hatches, ready to paste. */
function noTtyAppIdError(parsed: ParsedArgs): DeployError {
	const example = renderConfigFile({
		appId: 123,
		staticPath: INIT_DEFAULTS.staticPath,
		endpoints: {
			mobile: INIT_DEFAULTS.entryFile,
			mvk: INIT_DEFAULTS.entryFile,
			web: INIT_DEFAULTS.entryFile,
		},
		environment: INIT_DEFAULTS.environment,
	});
	const flagParts = ["--app-id 123"];
	if (parsed.values.staticPath === undefined) {
		flagParts.push(`--static-path ${INIT_DEFAULTS.staticPath}`);
	}
	return new DeployError(
		"user",
		[
			"appId is required and this run has no TTY to prompt for it.",
			"",
			"Pass the values as flags:",
			`  vkma-deploy init ${flagParts.join(" ")}`,
			"",
			"Or create the config yourself:",
			example.trimEnd(),
		].join("\n"),
		{ code: "E_NO_TTY" },
	);
}

/** Tabs + defineDeployConfig, same shape as the create-app template. */
function renderConfigFile(values: InitValues): string {
	const lines: string[] = [`appId: ${values.appId},`];
	if (values.bundle !== undefined) {
		lines.push(`bundle: ${JSON.stringify(values.bundle)},`);
	} else {
		lines.push(`staticPath: ${JSON.stringify(values.staticPath ?? INIT_DEFAULTS.staticPath)},`);
	}
	const endpoints = (["mobile", "mvk", "web"] as const)
		.filter(platform => values.endpoints[platform] !== undefined)
		.map(platform => `${platform}: ${JSON.stringify(values.endpoints[platform])}`)
		.join(", ");
	lines.push(`endpoints: { ${endpoints} },`);
	lines.push(`environment: ${JSON.stringify(values.environment)},`);
	if (values.testGroupName !== undefined) {
		lines.push(`testGroupName: ${JSON.stringify(values.testGroupName)},`);
	}
	if (values.apiHost !== undefined) {
		lines.push(`apiHost: ${JSON.stringify(values.apiHost)},`);
	}
	if (values.oauthHost !== undefined) {
		lines.push(`oauthHost: ${JSON.stringify(values.oauthHost)},`);
	}
	return [
		'import { defineDeployConfig } from "@vkma.dev/deploy";',
		"",
		"export default defineDeployConfig({",
		...lines.map(line => `\t${line}`),
		"});",
		"",
	].join("\n");
}

/**
 * The generated file imports `@vkma.dev/deploy`; without the dependency
 * the user's typecheck breaks. Say it once, after the file is written.
 */
async function warnWhenPackageMissing(cwd: string, logger: RunContext["logger"]): Promise<void> {
	const pkgPath = path.join(cwd, "package.json");
	let deps: Record<string, unknown> = {};
	if (existsSync(pkgPath)) {
		try {
			const pkg = JSON.parse(await fs.readFile(pkgPath, "utf8")) as {
				dependencies?: Record<string, unknown>;
				devDependencies?: Record<string, unknown>;
			};
			deps = { ...pkg.dependencies, ...pkg.devDependencies };
		} catch {
			// An unreadable package.json gets the same hint as a missing one.
		}
	}
	if (!Object.hasOwn(deps, "@vkma.dev/deploy")) {
		logger.warn(
			"@vkma.dev/deploy is not in this project's dependencies; the config imports it — install it (e.g. npm i -D @vkma.dev/deploy) or TypeScript cannot resolve the import",
		);
	}
}
