import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { version } from "./src/manifest.chrome.json";

const browser = process.env.BROWSER === "firefox" ? "firefox" : "chrome";

/**
 * One flat MV3 dist: content scripts (host/frame/relay) as plain JS
 * entries at the dist root, the background service worker, and the React
 * panel as the only HTML entry (the FAB iframe, the tab panel and the
 * side panel are all `panel.html`).
 */
export default defineConfig({
	plugins: [pluginReact()],
	source: {
		entry: {
			background: { import: "./src/background/main.ts", html: false },
			host: { import: "./src/host/main.ts", html: false },
			frame: { import: "./src/frame/main.ts", html: false },
			relay: { import: "./src/relay/main.ts", html: false },
			themeBoot: {
				import: "./src/panel/theme-boot.ts",
				html: false,
				filename: "theme-boot.js",
			},
			panel: "./src/panel/main.tsx",
		},
		define: {
			__APP_VERSION__: JSON.stringify(version),
		},
	},
	html: {
		template: "./src/panel/index.html",
	},
	output: {
		filenameHash: false,
		distPath: {
			js: "./",
			jsAsync: "./",
			css: "./",
		},
		legalComments: "none",
		copy: [
			{ from: `src/manifest.${browser}.json`, to: "manifest.json" },
			{ from: "src/icons", to: "icons" },
		],
	},
	performance: {
		chunkSplit: {
			strategy: "all-in-one",
		},
	},
});
