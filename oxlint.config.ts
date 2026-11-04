import { defineOxlintConfig } from "@pajecawav/tools";

export default defineOxlintConfig({
	plugins: ["react"],
	ignorePatterns: [
		"**/dist",
		"**/coverage",
		"**/.astro",
		"**/web-ext-artifacts",
		"**/packages/api-schema/schema",
		"**/packages/api-schema/src/generated",
		"**/packages/api-schema/.schema-transformed",
		"**/packages/bridge-schema/schema",
		"**/packages/bridge-schema/src/generated",
		"**/packages/bridge-schema/src/index.ts",
		// create-app templates are scaffold payloads with no tsconfig context
		// here — type-aware rules resolve everything to `any` and misfire;
		// the e2e job type-checks them for real (tsc in generated apps)
		"**/packages/create-app/templates",
	],
	rules: {
		"typescript/explicit-member-accessibility": "error",
		// the automatic JSX runtime imports React itself; the classic rule
		// reads sources and "cannot find" it (740+ false positives)
		"react/react-in-jsx-scope": "off",
		// the two rules the plugin is for, pinned at error: conditional
		// hooks and deps drift in effects/memos
		"react/rules-of-hooks": "error",
		"react-hooks/exhaustive-deps": "error",
	},
});
