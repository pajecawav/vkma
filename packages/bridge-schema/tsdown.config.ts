import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/schema.ts"],
	format: "esm",
	dts: { sourcemap: true },
	sourcemap: true,
	clean: true,
	fixedExtension: false,
	unbundle: true,
});
