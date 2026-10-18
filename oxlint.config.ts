import { defineOxlintConfig } from "@pajecawav/tools";

export default defineOxlintConfig({
	ignorePatterns: ["**/dist", "**/coverage", "**/.astro", "**/web-ext-artifacts"],
	rules: {
		"typescript/explicit-member-accessibility": "error",
	},
});
