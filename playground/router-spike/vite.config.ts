import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// PROTOTYPE (spike 1): panels + animations in the static-children model.
// Throwaway validation playground for @vkma.dev/router, see
// packages/router/DESIGN.md "Spikes".
export default defineConfig({
	plugins: [react()],
});
