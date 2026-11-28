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
 * The source-level test in `main.test.ts` cannot see a regression here:
 * in a fresh checkout it reads the same `package.json` a build would have
 * frozen. A static JSON import becomes `dist/package.js` at build time,
 * and the root `changeset:version` script builds before it bumps. The
 * published tarballs therefore went out one release behind their own
 * `--version`: deploy 0.3.1 printed 0.3.0, and 0.3.0 printed 0.2.1.
 *
 * The check puts a build next to a `package.json` that carries a sentinel
 * version and runs the CLI from there. It needs `dist/` and is skipped
 * without one (CI builds before it tests).
 */

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
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
