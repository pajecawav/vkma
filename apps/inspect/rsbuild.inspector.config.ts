import { defineConfig } from "@rsbuild/core";
import { baseConfig } from "./rsbuild.config.ts";

/**
 * The inspector: a single self-contained classic script served at
 * `/inspector.js?id=<peer id>`. One entry, no HTML, no code splitting —
 * `all-in-one` with a lone entry is exactly one file. It must stay free
 * of ESM-only syntax (`import.meta`, top-level await, `export`): the same
 * bytes run as a head <script> tag AND as a console `import()` on pages
 * we do not control.
 */
export default defineConfig({
	...baseConfig,
	source: {
		entry: {
			inspector: "./src/inspector/index.ts",
		},
	},
	tools: {
		// JS only — no HTML page for this pass (the spy's vercel-env trick).
		htmlPlugin: false,
	},
	performance: {
		chunkSplit: {
			strategy: "all-in-one",
		},
	},
	output: {
		...baseConfig.output,
		// The URL is embedded in other people's HTML — it must never rot.
		filenameHash: false,
		filename: {
			js: "inspector.js",
		},
		// This pass runs AFTER the panel pass into the same dist — it must
		// not wipe it (same ritual as the devtools inject build).
		cleanDistPath: false,
	},
});
