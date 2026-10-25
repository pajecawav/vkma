import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The showcase playground for @vkma.dev/router — it CONSUMES the package
// (dist), see packages/router/AGENTS.md. New design questions still get
// spikes here, and every answer lands back in DESIGN.md.
export default defineConfig({
	plugins: [react()],
});
