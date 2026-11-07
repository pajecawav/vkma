import react from "@vitejs/plugin-react";
import { vkmaDevtools } from "@vkma.dev/devtools";
import { defineConfig } from "vite";

/** One permanent manual-e2e app, with every devtools surface opt-in by script. */
export default defineConfig({
	plugins: [
		react(),
		...(process.env.VKMA_HUB === "1"
			? [(await import("@vitejs/devtools")).DevTools(), vkmaDevtools({ hub: true })]
			: [
					vkmaDevtools({
						mcp: process.env.VKMA_MCP === "1",
						fabPosition: process.env.VKMA_FAB === "1" ? "bottom-left" : undefined,
					}),
				]),
	],
});
