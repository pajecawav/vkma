/**
 * Preflight checks: everything that can be verified locally before touching
 * the network. Replaces upstream's silent failures (zipping `./undefined`,
 * `TypeError` on a missing `endpoints` key) with actionable errors.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { ResolvedConfig } from "./config/schema.ts";
import { DeployError } from "./errors.ts";

export interface PreflightResult {
	readonly staticPath?: string;
	readonly bundlePath?: string;
	readonly endpointFiles: readonly { platform: string; endpoint: string; file: string }[];
}

/**
 * Mirrors upstream endpoint semantics: `new URL("/" + endpoint, "https://.")`
 * yields a pathname (query strings are dropped), which must exist inside the
 * bundle directory.
 */
export function endpointFilePath(staticPath: string, endpoint: string): string {
	const pathname = new URL(`/${endpoint}`, "https://.").pathname;
	return path.join(staticPath, pathname);
}

export async function preflight(config: ResolvedConfig, cwd: string): Promise<PreflightResult> {
	const endpointFiles: { platform: string; endpoint: string; file: string }[] = [];

	if (config.bundle !== undefined) {
		const bundlePath = path.resolve(cwd, config.bundle);
		const stats = await fs.stat(bundlePath).catch(() => undefined);
		if (stats === undefined) {
			throw new DeployError(
				"config",
				`Bundle file not found: ${config.bundle} (resolved: ${bundlePath})`,
				{
					code: "E_NO_BUNDLE",
				},
			);
		}
		if (!stats.isFile()) {
			throw new DeployError("config", `Bundle path is not a file: ${bundlePath}`, {
				code: "E_NO_BUNDLE",
			});
		}
		return { bundlePath, endpointFiles };
	}

	const staticPath = config.staticPath as string;
	const staticAbs = path.resolve(cwd, staticPath);
	const staticStats = await fs.stat(staticAbs).catch(() => undefined);
	if (staticStats === undefined) {
		throw new DeployError(
			"config",
			`staticPath "${staticPath}" does not exist (resolved: ${staticAbs}). Fix staticPath or build the app first — upstream silently zipped "./undefined" here.`,
			{ code: "E_NO_STATIC_PATH" },
		);
	}
	if (!staticStats.isDirectory()) {
		throw new DeployError("config", `staticPath is not a directory: ${staticAbs}`, {
			code: "E_NO_STATIC_PATH",
		});
	}

	for (const platform of ["mobile", "mvk", "web"] as const) {
		const endpoint = config.endpoints[platform];
		const file = endpointFilePath(staticAbs, endpoint);
		const stats = await fs.stat(file).catch(() => undefined);
		if (stats === undefined || !stats.isFile()) {
			throw new DeployError(
				"config",
				`Endpoint file for "${platform}" not found: ${file} (endpoint: "${endpoint}"). Upstream reported this as: File ${file} not found.`,
				{ code: "E_NO_ENDPOINT" },
			);
		}
		endpointFiles.push({ platform, endpoint, file });
	}

	return { staticPath: staticAbs, endpointFiles };
}
