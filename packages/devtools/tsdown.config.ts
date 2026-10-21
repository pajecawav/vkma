import { defineConfig } from "tsdown";

/**
 * Unbundled output: dist mirrors src one-to-one, so consumers' IDEs and
 * stack traces can follow declaration/source maps back to the real
 * sources (also shipped in the tarball — see `files` in package.json).
 */
export default defineConfig({
	entry: ["src/index.ts", "src/react.tsx"],
	root: "src",
	format: "esm",
	unbundle: true,
	dts: { sourcemap: true },
	sourcemap: true,
	clean: true,
	fixedExtension: false,
});
