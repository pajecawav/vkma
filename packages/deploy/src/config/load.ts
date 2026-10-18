/**
 * Config file loading.
 *
 * Supported files:
 * - `vkma-deploy.config.{ts,mts,js,mjs,json}` — ours (camelCase)
 * - `vk-hosting-config.json` — legacy upstream format (mapped by `legacy.ts`)
 *
 * TypeScript is supported with zero dependencies via the native
 * `module.stripTypeScriptTypes()` (Node >= 22.13). Because a `data:` URL
 * module cannot resolve relative imports, stripped source is written to a
 * temporary sibling file (same directory, so relative imports keep working)
 * and removed after loading.
 */

import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { DeployError } from "../errors.ts";
import { LEGACY_CONFIG_FILENAME, mapLegacyConfig } from "./legacy.ts";
import type { DeployConfigInput } from "./schema.ts";

export const CONFIG_BASENAME = "vkma-deploy.config";
export const CONFIG_EXTENSIONS = ["ts", "mts", "js", "mjs", "json"] as const;

/** Full candidate list in priority order; first existing file wins. */
export function configCandidates(): string[] {
	return [...CONFIG_EXTENSIONS.map(ext => `${CONFIG_BASENAME}.${ext}`), LEGACY_CONFIG_FILENAME];
}

export interface LoadedConfigFile {
	readonly config: DeployConfigInput;
	readonly path: string;
	readonly legacy: boolean;
	readonly warnings: readonly string[];
}

export async function loadConfigFile(filePath: string): Promise<LoadedConfigFile> {
	const resolved = path.resolve(filePath);
	const ext = path.extname(resolved).slice(1).toLowerCase();
	const legacy = path.basename(resolved) === LEGACY_CONFIG_FILENAME;

	if (ext === "json" || legacy) {
		const raw = await readJson(resolved);
		if (legacy) {
			try {
				const mapped = mapLegacyConfig(raw);
				return { config: mapped.config, path: resolved, legacy, warnings: mapped.warnings };
			} catch (cause) {
				throw new DeployError(
					"config",
					`Invalid legacy config ${resolved}: ${(cause as Error).message}`,
					{ cause },
				);
			}
		}
		return { config: raw as DeployConfigInput, path: resolved, legacy, warnings: [] };
	}

	if (ext === "ts" || ext === "mts") {
		const config = await loadTypeScriptConfig(resolved);
		return { config, path: resolved, legacy, warnings: [] };
	}

	if (ext === "js" || ext === "mjs") {
		const config = await loadJavaScriptConfig(resolved);
		return { config, path: resolved, legacy, warnings: [] };
	}

	throw new DeployError("config", `Unsupported config file extension: ${filePath}`);
}

async function readJson(filePath: string): Promise<unknown> {
	let text: string;
	try {
		text = await fs.readFile(filePath, "utf8");
	} catch (cause) {
		throw new DeployError("config", `Cannot read config file ${filePath}`, { cause });
	}
	try {
		return JSON.parse(text);
	} catch (cause) {
		throw new DeployError("config", `Config file ${filePath} is not valid JSON`, { cause });
	}
}

async function loadJavaScriptConfig(filePath: string): Promise<DeployConfigInput> {
	const module = await importModule(filePath);
	return unwrapDefault(module, filePath);
}

async function loadTypeScriptConfig(filePath: string): Promise<DeployConfigInput> {
	let source: string;
	try {
		source = await fs.readFile(filePath, "utf8");
	} catch (cause) {
		throw new DeployError("config", `Cannot read config file ${filePath}`, { cause });
	}

	// `mode: "strip"` matches tsc `verbatimModuleSyntax`: no enums, no
	// namespaces, no parameter properties in config files.
	const stripped = stripTypeScriptTypes(source, { mode: "strip" });

	const tempPath = path.join(
		path.dirname(filePath),
		`.vkma-deploy.config.tmp-${randomBytes(6).toString("hex")}.mjs`,
	);
	await fs.writeFile(tempPath, stripped, "utf8");
	try {
		const module = await importModule(tempPath);
		return unwrapDefault(module, filePath);
	} finally {
		await fs.rm(tempPath, { force: true });
	}
}

async function importModule(filePath: string): Promise<Record<string, unknown>> {
	let module: unknown;
	try {
		module = await import(pathToFileURL(filePath).href);
	} catch (cause) {
		throw new DeployError("config", `Failed to import config file ${filePath}`, { cause });
	}
	if (module === null || typeof module !== "object") {
		throw new DeployError("config", `Config file ${filePath} did not produce a module`);
	}
	return module as Record<string, unknown>;
}

async function unwrapDefault(
	module: Record<string, unknown>,
	filePath: string,
): Promise<DeployConfigInput> {
	let value: unknown = module["default"] ?? module;

	// Allow `export default () => ({ ... })` factory functions.
	if (typeof value === "function") {
		value = await value();
	}

	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		throw new DeployError(
			"config",
			`Config file ${filePath} must default-export an object (or a function returning one)`,
		);
	}
	return value;
}
