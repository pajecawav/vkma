import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { baseConfig } from "./rsbuild.config.ts";

/**
 * Dev: both entries in one build so `rsbuild dev` serves the panel with
 * HMR and the inspector at /inspector.js from the same origin. Shared
 * chunks are fine here (same-origin); production keeps the two-pass
 * split — see rsbuild.panel.config.ts / rsbuild.inspector.config.ts.
 */
export default defineConfig({
	...baseConfig,
	plugins: [pluginReact()],
	source: {
		entry: {
			panel: "./src/panel/main.tsx",
			inspector: { import: "./src/inspector/index.ts", html: false },
		},
	},
	html: {
		template: "./src/panel/index.html",
		title: "vkma inspect",
	},
});
