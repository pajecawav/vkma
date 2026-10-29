import react from "@vitejs/plugin-react";
import { vkmaDevtools } from "@vkma.dev/devtools";
import { defineConfig } from "vite";

// The devtools plugin serves the /__vkma/ panel: bridge traffic timeline,
// connected clients and interactive execute — alongside your dev server.
export default defineConfig({
	plugins: [react(), vkmaDevtools()],
});
