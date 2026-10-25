import { defineConfig } from "tsdown";

/**
 * Unbundled output: dist mirrors src one-to-one, so consumers' IDEs and
 * stack traces can follow declaration/source maps back to the real
 * sources (also shipped in the tarball — see `files` in package.json).
 */
export default defineConfig({
	entry: ["src/index.ts", "src/rsbuild/index.ts"],
	root: "src",
	format: "esm",
	unbundle: true,
	// The protocol package is private (workspace-only); inline it so the
	// published dist keeps working without a runtime dependency on it.
	deps: { alwaysBundle: ["@vkma.dev/protocol"] },
	dts: { sourcemap: true },
	sourcemap: true,
	clean: true,
	fixedExtension: false,
});
