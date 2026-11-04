import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The inspector artifact contract: ONE file, runnable as a classic
 * <script> and as a console import(). No ESM-only syntax may survive
 * the bundler. Skipped on a fresh clone without a build (CI builds
 * first; `pnpm build` produces dist/inspector.js).
 */

const artifact = resolve(__dirname, "../../dist/inspector.js");
const built = existsSync(artifact);

describe.skipIf(!built)("dist/inspector.js artifact", () => {
	const source = built ? readFileSync(artifact, "utf8") : "";

	it("contains no import.meta (a SyntaxError in classic scripts)", () => {
		expect(source).not.toMatch(/import\.meta/);
	});

	it("contains no ESM export statements", () => {
		expect(source).not.toMatch(/\bexport\s*\{/);
		expect(source).not.toMatch(/\bexport default\b/);
	});

	it("contains no static import statements", () => {
		expect(source).not.toMatch(/\bimport\s*\{/);
		expect(source).not.toMatch(/\bimport\s+\w/);
	});
});
