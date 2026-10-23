import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
	root: "app",
	// Relative asset paths so the built SPA works at any mount base.
	base: "./",
	plugins: [react(), tailwindcss()],
	build: {
		outDir: "../dist-client",
		emptyOutDir: true,
		sourcemap: true,
	},
});
