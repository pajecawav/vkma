import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { vkmaDevtoolsRsbuild } from "@vkma.dev/devtools/rsbuild";

/**
 * The same fake mini app as `playground/mini-app`, on Rsbuild instead of
 * Vite: it imports the ORIGINAL @vkontakte/vk-bridge everywhere so the
 * NormalModuleReplacementPlugin interception is what routes it through
 * the tap. Manual e2e target for the rsbuild adapter.
 */
export default defineConfig({
	plugins: [pluginReact(), vkmaDevtoolsRsbuild({ mcp: process.env.VKMA_MCP === "1" })],
});
