import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { baseConfig, SITE_TITLE } from "./rsbuild.config.ts";

/**
 * Dev: both entries in one build so `rsbuild dev` serves the panel with
 * HMR and the inspector at /inspector.js from the same origin.
 *
 * `all-in-one` is load-bearing for the inspector. Its entry has no HTML
 * page to carry initial chunks as script tags, so under a splitting
 * strategy the lone `<script src>` waits on `lib-react` & co that nothing
 * loads, on a foreign page and on a same-origin one alike: the snippet
 * never started. Self-contained, it dials from wherever it is pasted.
 * Production keeps the two-pass split, see rsbuild.panel.config.ts /
 * rsbuild.inspector.config.ts.
 */
export default defineConfig({
	...baseConfig,
	plugins: [pluginReact()],
	source: {
		entry: {
			index: "./src/panel/main.tsx",
			inspector: { import: "./src/inspector/index.ts", html: false },
		},
	},
	html: {
		template: "./src/panel/index.html",
		title: SITE_TITLE,
	},
	performance: {
		chunkSplit: {
			strategy: "all-in-one",
		},
	},
});
