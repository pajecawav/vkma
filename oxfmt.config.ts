import { defineOxfmtConfig } from "@pajecawav/tools";

export default defineOxfmtConfig({
	ignorePatterns: [
		"**/dist",
		"**/coverage",
		"**/.astro",
		"**/web-ext-artifacts",
		"**/packages/api-schema/schema",
		"**/packages/api-schema/src/generated",
		"**/packages/api-schema/.schema-transformed",
	],
});
