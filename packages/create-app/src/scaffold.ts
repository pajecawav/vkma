import { existsSync } from "node:fs";
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Preset } from "./presets.ts";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TEMPLATES_DIR = join(PACKAGE_ROOT, "templates");

/** File extensions that go through {{token}} substitution. */
const TEXT_EXTENSIONS = new Set([".css", ".html", ".json", ".md", ".ts", ".tsx", ".txt"]);

interface PackageJsonFragment {
	name?: string;
	scripts?: Record<string, string>;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
}

export interface ScaffoldResult {
	/** Absolute path of the created project. */
	targetDir: string;
	/** Sanitized npm package name derived from the directory name. */
	appName: string;
	/** Human-readable project title (the raw directory name). */
	appTitle: string;
}

/** Directory name → npm package name (lowercase, scoped-safe characters only). */
export function toPackageName(dirName: string): string {
	const name = dirName
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/^[-._]+/g, "")
		.replace(/[-._]+$/g, "");
	return name.length > 0 ? name : "vk-mini-app";
}

/** Pinned `1.2.3` → `^1.2.3`; already-ranged values pass through untouched. */
function toCaretRange(version: string): string {
	return version.startsWith("^") || version.startsWith("~") ? version : `^${version}`;
}

/**
 * Scaffold a project: base template → preset overlay files → assembled
 * package.json → {{token}} substitution in every text file.
 */
export async function scaffoldProject(targetDir: string, preset: Preset): Promise<ScaffoldResult> {
	const absolute = resolve(process.cwd(), targetDir);
	const dirName = dirname(absolute) === absolute ? absolute : basenameOf(absolute);
	const appName = toPackageName(dirName);
	const appTitle = dirName;

	await mkdir(absolute, { recursive: true });

	const baseDir = join(TEMPLATES_DIR, "base");
	await copyTemplate(baseDir, absolute);
	if (preset.overlay !== null) {
		await copyTemplate(join(TEMPLATES_DIR, preset.overlay), absolute);
		await applyOverlayRemovals(join(TEMPLATES_DIR, preset.overlay), absolute);
	}
	await restoreDotfiles(absolute);

	const baseFragment = await readFragment(join(baseDir, "package.json"));
	const overlayFragment =
		preset.overlay !== null
			? await readFragment(join(TEMPLATES_DIR, preset.overlay, "package.json"))
			: undefined;

	const packageJson = assemblePackageJson(appName, baseFragment, overlayFragment);
	await writeFile(join(absolute, "package.json"), `${JSON.stringify(packageJson, null, "\t")}\n`);

	await substituteTokens(absolute, {
		appName,
		appTitle,
		presetTitle: preset.title,
	});

	return { targetDir: absolute, appName, appTitle };
}

/** Files that never reach the target as-is: fragments and the overlay manifest. */
const NON_TEMPLATE_FILES = new Set(["package.json", "overlay.json"]);

/**
 * npm pack never ships `.gitignore` files in a tarball, so the template's
 * gitignore travels under its dotless name and lands as the dotfile here.
 */
function restoreDotfiles(targetDir: string): Promise<void> {
	const gitignore = join(targetDir, "gitignore");
	if (!existsSync(gitignore)) {
		return Promise.resolve();
	}
	return rename(gitignore, join(targetDir, ".gitignore"));
}

interface OverlayManifest {
	/** Base-template files this preset replaces with its own structure. */
	remove?: string[];
}

/** Copy a template dir into the target, overlaying files; fragments are handled separately. */
async function copyTemplate(from: string, to: string): Promise<void> {
	await cp(from, to, {
		recursive: true,
		force: true,
		filter: source => !NON_TEMPLATE_FILES.has(basenameOf(source)),
	});
}

async function readFragment(path: string): Promise<PackageJsonFragment> {
	return JSON.parse(await readFile(path, "utf8")) as PackageJsonFragment;
}

/** Apply the overlay's `remove` list — base files replaced by the preset's structure. */
async function applyOverlayRemovals(overlayDir: string, targetDir: string): Promise<void> {
	const manifestPath = join(overlayDir, "overlay.json");
	if (!existsSync(manifestPath)) {
		return;
	}
	const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as OverlayManifest;
	for (const relative of manifest.remove ?? []) {
		await rm(join(targetDir, relative), { force: true });
	}
}

function assemblePackageJson(
	appName: string,
	base: PackageJsonFragment,
	overlay?: PackageJsonFragment,
): Record<string, unknown> {
	const dependencies = Object.fromEntries(
		Object.entries({ ...base.dependencies, ...overlay?.dependencies }).map(
			([name, version]) => [name, toCaretRange(version)],
		),
	);
	const devDependencies = Object.fromEntries(
		Object.entries({ ...base.devDependencies, ...overlay?.devDependencies }).map(
			([name, version]) => [name, toCaretRange(version)],
		),
	);

	return {
		name: appName,
		private: true,
		version: "0.0.0",
		type: "module",
		engines: { node: ">=22.18.0" },
		scripts: { ...base.scripts, ...overlay?.scripts },
		dependencies,
		devDependencies,
	};
}

async function substituteTokens(
	dir: string,
	tokens: { appName: string; appTitle: string; presetTitle: string },
): Promise<void> {
	const entries = await readdir(dir, { withFileTypes: true });
	for (const entry of entries) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			await substituteTokens(path, tokens);
			continue;
		}
		if (!TEXT_EXTENSIONS.has(extensionOf(entry.name))) {
			continue;
		}
		const source = await readFile(path, "utf8");
		const replaced = source
			.replaceAll("{{appName}}", tokens.appName)
			.replaceAll("{{appTitle}}", tokens.appTitle)
			.replaceAll("{{presetTitle}}", tokens.presetTitle);
		if (replaced !== source) {
			await writeFile(path, replaced);
		}
	}
}

function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot === -1 ? "" : name.slice(dot);
}

function basenameOf(path: string): string {
	const parts = path.split(/[\\/]/).filter(Boolean);
	return parts.at(-1) ?? path;
}
