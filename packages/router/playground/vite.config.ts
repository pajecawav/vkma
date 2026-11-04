import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The demo playground for @vkma.dev/router. It CONSUMES the package
// (dist), see packages/router/AGENTS.md. New design questions still get
// spikes here, and every answer lands back in DESIGN.md.
export default defineConfig({
	plugins: [react()],
});
