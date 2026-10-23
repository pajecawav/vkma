import { defineConfig } from "vite";

/**
 * Builds the inject collector — the script the Vite plugin adds to the mini
 * app's page — as a single self-contained ES module emitted next to the SPA
 * (`dist-client/inject.js`), so the panel base serves it at
 * `/__vkma/inject.js`.
 */
export default defineConfig({
	build: {
		lib: {
			entry: "src/inject/index.ts",
			formats: ["es"],
			fileName: () => "inject.js",
		},
		outDir: "dist-client",
		emptyOutDir: false,
		minify: true,
		sourcemap: true,
	},
});
