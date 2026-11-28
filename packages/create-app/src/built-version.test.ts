import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

/**
 * The built CLI reports the version of the package it sits in — not the
 * one that was current when it was built.
 *
 * `--version` is a plain line on stdout, printed before any prompt, so it
 * runs unattended. The other two CLIs of the repo hold the same contract
 * in their `built-version.test.ts`, and for a reason: a static JSON import
 * becomes `dist/package.js` at build time, and the root `changeset:version`
 * script builds before it bumps, so their published tarballs went out one
 * release behind their own `--version`. This one reads `package.json`
 * where it runs; the check keeps it that way.
 *
 * The check puts a build next to a `package.json` that carries a sentinel
 * version and runs the CLI from there. It needs `dist/` and is skipped
 * without one (CI builds before it tests).
 */

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(packageRoot, "dist");
const SENTINEL = "0.0.0-version-guard";

describe("the built CLI", () => {
	// Inside the package's own node_modules: Node resolves the CLI's
	// runtime dependencies by walking up from the file, so the copy still
	// finds them, while lint, tsc and vitest never look in there — a
	// leftover of an aborted run harms nothing.
	const scratchRoot = join(packageRoot, "node_modules", ".tmp");
	let scratch: string | undefined;

	afterAll(async () => {
		if (scratch !== undefined) {
			await rm(scratch, { recursive: true, force: true });
		}
	});

	it.skipIf(!existsSync(join(dist, "cli.js")))(
		"reports the version of the package it sits in",
		async () => {
			await mkdir(scratchRoot, { recursive: true });
			scratch = await mkdtemp(join(scratchRoot, "version-guard-"));
			await cp(dist, join(scratch, "dist"), { recursive: true });
			await writeFile(
				join(scratch, "package.json"),
				JSON.stringify({ name: "version-guard", version: SENTINEL, type: "module" }),
			);

			const run = spawnSync(
				process.execPath,
				[join(scratch, "dist", "cli.js"), "--version"],
				{
					encoding: "utf8",
				},
			);

			expect(run.status, run.stderr).toBe(0);
			expect(run.stdout).toBe(`${SENTINEL}\n`);
		},
	);
});
