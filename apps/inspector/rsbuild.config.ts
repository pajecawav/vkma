import { defineConfig } from "@rsbuild/core";
import { pluginSolid } from "@rsbuild/plugin-solid";

const browser = process.env.BROWSER === "firefox" ? "firefox" : "chrome";

export default defineConfig({
	plugins: [pluginSolid()],
	source: {
		entry: {
			background: { import: "./src/background/index.ts", html: false },
			popup: "./src/popup/index.tsx",
		},
	},
	output: {
		filenameHash: false,
		distPath: {
			js: "./",
			jsAsync: "./",
		},
		chunkSplit: {
			strategy: "all-in-one",
		},
		legalComments: "none",
		copy: [{ from: `src/manifest.${browser}.json`, to: "manifest.json" }],
	},
});
