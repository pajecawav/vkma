import { defineConfig } from "tsdown";

/**
 * Unbundled output: dist mirrors src one-to-one (repo convention). The
 * package is private — never published; the devtools inlines it at build
 * (`deps.alwaysBundle`), the extension bundles it as a normal dependency.
 */
export default defineConfig({
	entry: ["src/index.ts", "src/schemas.ts"],
	root: "src",
	format: "esm",
	unbundle: true,
	dts: { sourcemap: true },
	sourcemap: true,
	clean: true,
	fixedExtension: false,
});
