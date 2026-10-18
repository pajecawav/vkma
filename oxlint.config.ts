import { defineOxlintConfig } from "@pajecawav/tools";

export default defineOxlintConfig({
	ignorePatterns: ["**/dist", "**/coverage"],
	rules: {
		"typescript/explicit-member-accessibility": "error",
	},
});
