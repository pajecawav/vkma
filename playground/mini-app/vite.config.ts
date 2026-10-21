import react from "@vitejs/plugin-react";
import { vkmaDevtools } from "@vkma.dev/devtools";
import { defineConfig } from "vite";

/**
 * A fake mini app for manual e2e checks: it deliberately imports the
 * ORIGINAL @vkontakte/vk-bridge everywhere so the plugin's dev alias is
 * what routes it through the tap.
 */
export default defineConfig({
	plugins: [react(), vkmaDevtools()],
});
