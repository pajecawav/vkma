import { defineConfig } from "tsdown";

/**
 * Unbundled output (dist mirrors src), one entry per layer: the core is
 * React-free, the other entries pull in their layer's peers.
 */
export default defineConfig({
	entry: ["src/index.ts", "src/react.ts", "src/vkui.ts", "src/preset.ts"],
	root: "src",
	format: "esm",
	unbundle: true,
	dts: { sourcemap: true },
	sourcemap: true,
	clean: true,
	fixedExtension: false,
	external: ["@vkontakte/vkui", "@tanstack/react-router", "react", "react/jsx-runtime"],
});
