/**
 * Locating and vetting the `cloudflared` executable.
 *
 * PATH only — this package never downloads anything (DESIGN.md, D2): a
 * missing binary is a config error that says how to install it. A name is
 * looked up in the injected `PATH`; anything with a separator is taken as
 * a path. The lookup is explicit (rather than left to `spawn`) so that a
 * missing binary fails before any child is started, with a useful message —
 * and so that Windows is handled the way it resolves commands: a bare name
 * is `name.exe`, and the variable is spelled `Path`.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_CLOUDFLARED_BINARY } from "../constants.ts";
import { TunnelError } from "../errors.ts";

/** Environment as every provider receives it: the caller's snapshot. */
export type ProviderEnv = Record<string, string | undefined>;

/** Cloudflare supports releases for one year; older ones warn, still run. */
export const CLOUDFLARED_SUPPORT_DAYS = 365;

export interface CloudflaredVersion {
	/** e.g. `2026.11.0` — cloudflared numbers releases by year and month. */
	readonly version: string;
	/** The build stamp from `--version`, when present. */
	readonly built?: string;
	/** Days since the release date encoded in the version. */
	readonly ageDays: number;
}

/**
 * What a bare name is called on disk. Windows resolves `cloudflared` to
 * `cloudflared.exe` and nothing else: `.cmd`/`.bat` shims are left out on
 * purpose — they cannot be spawned without a shell, and cloudflared ships
 * as an `.exe`. A name that already carries an extension is taken as is.
 */
function executableName(name: string, platform: NodeJS.Platform): string {
	if (platform === "win32" && path.extname(name) === "") {
		return `${name}.exe`;
	}
	return name;
}

/**
 * `PATH` as the platform spells it. Windows keeps it as `Path`, and a
 * plain-object copy of the environment keeps that spelling — only there is
 * the lookup case-insensitive, everywhere else `Path` is another variable.
 */
function pathOf(env: ProviderEnv, platform: NodeJS.Platform): string | undefined {
	if (env["PATH"] !== undefined || platform !== "win32") {
		return env["PATH"];
	}
	const key = Object.keys(env).find(candidate => candidate.toUpperCase() === "PATH");
	return key === undefined ? undefined : env[key];
}

/**
 * Resolves the executable to run: an absolute path, or the first match in
 * `PATH` that is a file we may execute. The platform only defaults to the
 * real one; tests name it.
 */
export function resolveCloudflaredBinary(
	requested: string | undefined,
	env: ProviderEnv,
	platform: NodeJS.Platform = process.platform,
): string {
	const name = (requested ?? "").trim() || DEFAULT_CLOUDFLARED_BINARY;
	if (name.includes("/") || name.includes("\\")) {
		const absolute = path.resolve(name);
		if (!isExecutableFile(absolute, platform)) {
			throw missing(name, `${absolute} is not an executable file`, env, platform);
		}
		return absolute;
	}
	const searchPath = pathOf(env, platform) ?? "";
	const candidate = executableName(name, platform);
	for (const directory of searchPath.split(path.delimiter)) {
		if (directory === "") {
			continue;
		}
		const file = path.join(directory, candidate);
		if (isExecutableFile(file, platform)) {
			return file;
		}
	}
	throw missing(name, `not found on PATH (${path.delimiter}-separated lookup)`, env, platform);
}

function missing(
	name: string,
	detail: string,
	env: ProviderEnv,
	platform: NodeJS.Platform,
): TunnelError {
	const searched = (pathOf(env, platform) ?? "") === "" ? " PATH is empty." : "";
	return new TunnelError(
		"config",
		[
			`cloudflared binary "${name}": ${detail}.${searched}`,
			"Install it and make sure it is on PATH — this package never downloads it:",
			"  macOS   brew install cloudflared",
			"  Debian/Ubuntu  see https://pkg.cloudflare.com/ (apt install cloudflared)",
			"  Windows winget install --id Cloudflare.cloudflared",
			"  or a binary from https://github.com/cloudflare/cloudflared/releases",
		].join("\n"),
		{ code: "E_CLOUDFLARED_MISSING" },
	);
}

/**
 * A file we may start. Windows has no executable bit — the `.exe` in the
 * name (see `executableName`) and the file's existence are the whole test —
 * so `X_OK` is asked for everywhere else only.
 */
function isExecutableFile(file: string, platform: NodeJS.Platform): boolean {
	try {
		if (platform !== "win32") {
			fs.accessSync(file, fs.constants.X_OK);
		}
		return fs.statSync(file).isFile();
	} catch {
		return false;
	}
}

/**
 * Runs `cloudflared --version` once and parses its output
 * (`cloudflared version 2026.11.0 (built 20261113-20:44:36-UTC)`).
 */
export function readCloudflaredVersion(
	command: string,
	env: ProviderEnv,
	timeoutMs = 10_000,
): CloudflaredVersion {
	const result = spawnSync(command, ["--version"], {
		env: childEnv(env),
		encoding: "utf8",
		timeout: timeoutMs,
	});
	const output = `${result.stdout ?? ""}${result.stderr ?? ""}`.trim();
	const match = /cloudflared version (\d{4})\.(\d{1,2})\.(\d{1,2})(?: \(built ([^)]*)\))?/.exec(
		output,
	);
	if (result.error !== undefined || result.status !== 0 || match === null) {
		throw new TunnelError(
			"config",
			`cloudflared --version did not answer as expected (exit ${String(result.status)}): ${output.slice(0, 200) || result.error?.message || "no output"}`,
			{ code: "E_CLOUDFLARED_VERSION", cause: result.error },
		);
	}
	const year = Number(match[1]);
	const month = Number(match[2]);
	const patch = Number(match[3]);
	const releasedAt = Date.UTC(year, month - 1, Math.min(patch, 28));
	return {
		version: `${match[1] ?? ""}.${match[2] ?? ""}.${match[3] ?? ""}`,
		built: match[4],
		ageDays: Math.max(0, Math.floor((Date.now() - releasedAt) / 86_400_000)),
	};
}

/** The child's environment: the caller's snapshot without `undefined` values. */
export function childEnv(env: ProviderEnv): Record<string, string> {
	const clean: Record<string, string> = {};
	for (const [key, value] of Object.entries(env)) {
		if (value !== undefined) {
			clean[key] = value;
		}
	}
	return clean;
}
