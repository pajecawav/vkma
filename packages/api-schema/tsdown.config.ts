import { defineConfig } from "tsdown";

export default defineConfig({
	entry: ["src/index.ts", "src/zod.ts", "src/valibot.ts"],
	format: "esm",
	dts: true,
	clean: true,
	fixedExtension: false,
	unbundle: true,
});
