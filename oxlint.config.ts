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
	],
	rules: {
		"typescript/explicit-member-accessibility": "error",
	},
});
