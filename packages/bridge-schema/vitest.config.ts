import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

/**
 * The augmentation tests import the package by its real specifier
 * (`declare module` merging only works against the declared module), so both
 * vitest and tsc (see `paths` in tsconfig.json) resolve the self-imports to
 * the generated sources — no build required to run the tests.
 */
export default defineConfig({
	resolve: {
		alias: [
			{
				find: /^@vkma\.dev\/bridge-schema\/catalogue$/,
				replacement: path.resolve(packageRoot, "src/catalogue.ts"),
			},
			{
				find: /^@vkma\.dev\/bridge-schema\/schema$/,
				replacement: path.resolve(packageRoot, "src/schema.ts"),
			},
			{
				find: /^@vkma\.dev\/bridge-schema$/,
				replacement: path.resolve(packageRoot, "src/index.ts"),
			},
		],
	},
});
