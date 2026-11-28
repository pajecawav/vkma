import react from "@vitejs/plugin-react";
import { vkmaDevtools } from "@vkma.dev/devtools";
import { vkmaTunnel } from "@vkma.dev/tunnel/vite";
import { defineConfig } from "vite";

// The devtools plugin serves the /__vkma/ panel: bridge traffic timeline,
// connected clients and interactive execute, alongside your dev server.
export default defineConfig({
	plugins: [
		react(),
		vkmaDevtools(),
		// Public HTTPS tunnel to this dev server: open the app on a phone or
		// point the VK app settings at it without deploying. Switched off on
		// purpose — opt in with `enabled: true` (starts with the dev server),
		// or leave it and run `npm run tunnel` in a second terminal instead.
		vkmaTunnel({ enabled: false }),
	],
});
