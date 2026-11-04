import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { baseConfig } from "./rsbuild.config.ts";

/** The panel SPA: `/` serves the same @vkma.dev/ui surface the extension
 * renders, with the DevtoolsStore and the PeerJS host in-process. The
 * `index` entry name puts the HTML at dist/index.html, what the
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
	performance: {
		chunkSplit: {
			strategy: "custom",
			// Named vendor groups instead of the default strategy's
			// anonymous leftover chunk (the 330 kB "t.js"): the react stack
			// keeps its own long-lived chunk, everything else from
			// node_modules (base-ui, peerjs, zod, lucide) becomes
			// lib-vendor. Workspace source (@vkma.dev/ui) resolves to real
			// paths and stays with the app in index-*.js, since it changes with
			// the panel anyway.
			splitChunks: {
				chunks: "all",
				cacheGroups: {
					react: {
						test: /[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/,
						name: "lib-react",
						priority: 20,
					},
					vendor: {
						test: /[\\/]node_modules[\\/]/,
						name: "lib-vendor",
						priority: 10,
					},
				},
			},
		},
	},
	output: {
		...baseConfig.output,
		// Dash-separated hashes keep the immutable-cache _headers patterns
		// simple (an index.js would collide with index.html's rule space).
		filename: {
			js: "[name]-[contenthash:8].js",
			css: "[name]-[contenthash:8].css",
		},
	},
});
