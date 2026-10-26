import type { RsbuildConfig } from "@rsbuild/core";

/**
 * Shared base for every inspect build: stable filenames (the inspector URL
 * is pasted into other people's HTML — it must never rot), flat output,
 * no legal noise. Entry/HTML wiring lives in the per-pass configs: the
 * panel and the inspector are built as SEPARATE passes so `inspector.js`
 * is a single self-contained file (no shared chunks — it has to work as
 * a plain classic <script> and as a console `import()` on foreign pages).
 */
export const baseConfig: RsbuildConfig = {
	output: {
		filenameHash: false,
		distPath: {
			js: "./",
			jsAsync: "./",
			css: "./",
		},
		legalComments: "none",
	},
};
