import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	test: {
		environment: "happy-dom",
	},
	resolve: {
		alias: [
			{
				find: /^@vkma\.dev\/bridge-schema$/,
				replacement: path.resolve(packageRoot, "../bridge-schema/src/index.ts"),
			},
		],
	},
});
