import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { baseConfig } from "./rsbuild.config.ts";

/** The panel SPA: `/` serves the same @vkma.dev/ui surface the extension
 * renders, with the DevtoolsStore and the PeerJS host in-process. The
 * `index` entry name puts the HTML at dist/index.html — what the
 * Workers static-assets SPA fallback expects at "/". */
export default defineConfig({
	...baseConfig,
	plugins: [pluginReact()],
	source: {
		entry: {
			index: "./src/panel/main.tsx",
		},
	},
	html: {
		template: "./src/panel/index.html",
		title: "vkma inspect",
	},
});
