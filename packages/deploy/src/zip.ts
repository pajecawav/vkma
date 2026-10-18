/**
 * Zip the static directory with fflate.
 *
 * Improvements over upstream (`zip-a-folder@0.0.12`):
 * - explicit empty-dir entries and deterministic (sorted) entry order
 * - filenames with spaces are just filenames (upstream issue #119)
 * - no `./build.zip` litter: the archive stays in memory unless a prebuilt
 *   `bundle` is configured
 */

import fs from "node:fs/promises";
import path from "node:path";
import { zip, type AsyncZippable } from "fflate";
import { DeployError } from "./errors.ts";

export interface ZipOptions {
	/** Called for every file added to the archive. */
	readonly onEntry?: (relativePath: string, bytes: number) => void;
}

interface WalkEntry {
	readonly relativePath: string;
	readonly data?: Uint8Array;
	readonly isDirectory: boolean;
}

async function walk(dir: string, current: string, out: WalkEntry[]): Promise<void> {
	const entries = (await fs.readdir(current, { withFileTypes: true })).toSorted((a, b) =>
		a.name.localeCompare(b.name, "en"),
	);
	for (const entry of entries) {
		const absolute = path.join(current, entry.name);
		const relative = path.relative(dir, absolute).split(path.sep).join("/");
		if (entry.isDirectory()) {
			out.push({ relativePath: relative, isDirectory: true });
			await walk(dir, absolute, out);
			continue;
		}
		if (entry.isFile()) {
			const data = await fs.readFile(absolute);
			out.push({ relativePath: relative, data: new Uint8Array(data), isDirectory: false });
			continue;
		}
		if (entry.isSymbolicLink()) {
			// Follow symlinked files; skip symlinked directories so the archive
			// cannot escape the bundle.
			const stats = await fs.stat(absolute).catch(() => undefined);
			if (stats?.isFile()) {
				const data = await fs.readFile(absolute);
				out.push({
					relativePath: relative,
					data: new Uint8Array(data),
					isDirectory: false,
				});
			}
		}
	}
}

export interface ZipResult {
	readonly archive: Uint8Array;
	readonly files: number;
	readonly bytes: number;
}

/** Zips `dir` into an in-memory archive. Fails on an empty directory. */
export async function zipDirectory(dir: string, options: ZipOptions = {}): Promise<ZipResult> {
	let entries: WalkEntry[];
	try {
		entries = [];
		await walk(path.resolve(dir), path.resolve(dir), entries);
	} catch (cause) {
		throw new DeployError(
			"config",
			`Cannot read staticPath ${dir}: ${(cause as Error).message}`,
			{ cause },
		);
	}

	const files = entries.filter(entry => !entry.isDirectory);
	if (files.length === 0) {
		throw new DeployError("config", `staticPath "${dir}" is empty — nothing to deploy`, {
			code: "E_EMPTY_BUNDLE",
		});
	}

	const zippable: AsyncZippable = {};
	let bytes = 0;
	for (const entry of entries) {
		if (entry.isDirectory) {
			zippable[`${entry.relativePath}/`] = new Uint8Array(0);
		} else {
			zippable[entry.relativePath] = entry.data as Uint8Array;
			bytes += (entry.data as Uint8Array).length;
			options.onEntry?.(entry.relativePath, (entry.data as Uint8Array).length);
		}
	}

	const archive = await new Promise<Uint8Array>((resolve, reject) => {
		zip(zippable, { level: 6 }, (error, data) => {
			if (error) {
				reject(
					new DeployError("network", `Failed to create zip archive: ${String(error)}`, {
						cause: error,
					}),
				);
			} else {
				resolve(data);
			}
		});
	});

	return { archive, files: files.length, bytes };
}
