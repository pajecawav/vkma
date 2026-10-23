import react from "@vitejs/plugin-react";
import { vkmaDevtools } from "@vkma.dev/devtools";
import { defineConfig } from "vite";

/**
 * A fake mini app for manual e2e checks: it deliberately imports the
 * ORIGINAL @vkontakte/vk-bridge everywhere so the plugin's dev alias is
 * what routes it through the tap.
 *
 * `VKMA_HUB=1 pnpm dev` runs the panel as a Vite DevTools dock instead
 * of standalone (needs @vitejs/devtools, kept in devDependencies);
 * `VKMA_MCP=1` turns the coding-agent MCP route on.
 */
export default defineConfig({
	plugins: [
		react(),
		...(process.env.VKMA_HUB === "1"
			? [(await import("@vitejs/devtools")).DevTools(), vkmaDevtools({ hub: true })]
			: [vkmaDevtools({ mcp: process.env.VKMA_MCP === "1" })]),
	],
});
