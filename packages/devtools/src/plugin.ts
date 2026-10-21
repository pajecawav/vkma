import {
	devframeViteBridge,
	devframeVitePlugin,
	type DevframeViteBridgeOptions,
} from "@devframes/vite/single";
import type { Plugin } from "vite";
import { vkmaDevframe } from "./node/definition.ts";

export interface VkmaDevtoolsOptions {
	/** Mount base for the panel and the RPC bridge. Default `/__vkma/`. */
	base?: string;
	/**
	 * Alias `@vkontakte/vk-bridge` to `@vkma.dev/bridge` in dev so every
	 * importer in the app (dependencies included) runs through the tap.
	 * Set `false` when the app imports `@vkma.dev/bridge` itself.
	 * Default `true`.
	 */
	alias?: boolean;
	/**
	 * WebSocket origin check forwarded to the bridge. Default `false`
	 * (any origin may connect, the interactive OTP auth gate stays the
	 * trust boundary) — needed for `vite --host`, tunnels and phones on
	 * LAN. Pass explicit origins to lock down.
	 */
	allowedOrigins?: DevframeViteBridgeOptions["allowedOrigins"];
	/** Extra options forwarded verbatim to the RPC bridge. */
	bridge?: Omit<DevframeViteBridgeOptions, "base" | "allowedOrigins">;
}

const BRIDGE_PACKAGE = "@vkontakte/vk-bridge";
const TAP_PACKAGE = "@vkma.dev/bridge";

/**
 * Importers that must see the REAL @vkontakte/vk-bridge: our own tap
 * package (its wrapper imports the original — aliasing that import would
 * create a self-cycle and a TDZ crash), in whatever layout pnpm places it.
 */
const TAP_IMPORTERS =
	/(?:\/packages\/bridge\/(?:src|dist)\/|@vkma\.dev\+bridge|node_modules\/@vkma\.dev\/bridge\/)/;

/**
 * The vkma devtools Vite plugin. One line in `vite.config` gives the mini
 * app: the `/__vkma/` panel (SPA + RPC/WebSocket bridge on Vite's own port),
 * the `@vkontakte/vk-bridge → @vkma.dev/bridge` dev interception, and the
 * FAB + collector script injected into the app page.
 */
export function vkmaDevtools(options: VkmaDevtoolsOptions = {}): Plugin[] {
	const base = options.base ?? "/__vkma/";

	return [
		// Static first: serve-static passes unknown paths through to the
		// bridge's terminal router (which answers `__connection.json`, `__ws`
		// and would otherwise 404 before the SPA files are reached).
		devframeVitePlugin(vkmaDevframe, { base }),
		devframeViteBridge(vkmaDevframe, {
			base,
			allowedOrigins: options.allowedOrigins ?? false,
			...options.bridge,
		}),
		{
			name: "vkma-devtools",
			apply: "serve",
			enforce: "pre",
			resolveId(source, importer) {
				if (options.alias === false || source !== BRIDGE_PACKAGE) {
					return;
				}
				// Our own tap package imports the original package — let that
				// resolve normally, or the "alias" becomes a self-cycle.
				if (importer !== undefined && TAP_IMPORTERS.test(importer)) {
					return;
				}
				// Everything else in the app graph gets the tap.
				return this.resolve(TAP_PACKAGE, importer, { skipSelf: true });
			},
			transformIndexHtml() {
				// A plain (non-module) script so Vite's dev HTML pipeline never
				// rewrites or inlines the src; it appends the real module tag at
				// runtime, after the app's own module scripts.
				const src = JSON.stringify(`${base}inject.js`);
				return [
					{
						tag: "script",
						children: `globalThis.__VKMA_DEVTOOLS_BASE__=${JSON.stringify(base)};(function(){var s=document.createElement("script");s.type="module";s.src=${src};document.body.appendChild(s);})();`,
						injectTo: "body",
					},
				];
			},
		},
	];
}
