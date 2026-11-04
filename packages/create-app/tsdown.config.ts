import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/cli.ts"],
	root: "src",
	format: "esm",
	unbundle: true,
	dts: { sourcemap: true },
	sourcemap: true,
	clean: true,
	fixedExtension: false,
});
