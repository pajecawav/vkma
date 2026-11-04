import type { RsbuildConfig } from "@rsbuild/core";

/**
 * Shared base for every inspect build: stable filenames (the inspector URL
 * is pasted into other people's HTML, so it must never rot), flat output,
 * no legal noise. Entry/HTML wiring lives in the per-pass configs: the
 * panel and the inspector are built as SEPARATE passes so `inspector.js`
 * is a single self-contained file (no shared chunks. It has to work as
 * a plain classic <script> and as a console `import()` on foreign pages).
 */
export const baseConfig: RsbuildConfig = {
	output: {
		// Filenames stay hashable here: only the inspector pins its name
		// (its URL is embedded in other people's HTML); the panel wants
		// content hashes for immutable caching.
		distPath: {
			js: "./",
			jsAsync: "./",
			css: "./",
		},
		legalComments: "none",
	},
};
