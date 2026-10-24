import { defineOxlintConfig } from "@pajecawav/tools";

export default defineOxlintConfig({
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
		"**/packages/bridge-schema/.bootstrap",
	],
	rules: {
		"typescript/explicit-member-accessibility": "error",
	},
});
