import {
	devframeViteBridge,
	devframeVitePlugin,
	type DevframeViteBridgeOptions,
} from "@devframes/vite/single";
import type { Plugin, UserConfig } from "vite";
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

function upsertAlias(userConfig: UserConfig): void {
	userConfig.resolve ??= {};
	const current = userConfig.resolve.alias;
	if (current === undefined) {
		userConfig.resolve.alias = [{ find: BRIDGE_PACKAGE, replacement: TAP_PACKAGE }];
		return;
	}
	if (Array.isArray(current)) {
		const hasOverride = current.some(
			entry =>
				typeof entry === "object" &&
				typeof entry.find === "string" &&
				entry.find === BRIDGE_PACKAGE,
		);
		if (!hasOverride) {
			current.push({ find: BRIDGE_PACKAGE, replacement: TAP_PACKAGE });
		}
		return;
	}
	// record form: { [find]: replacement }
	const record = current as Record<string, string>;
	if (!(BRIDGE_PACKAGE in record)) {
		record[BRIDGE_PACKAGE] = TAP_PACKAGE;
	}
}

/**
 * The vkma devtools Vite plugin. One line in `vite.config` gives the mini
 * app: the `/__vkma/` panel (SPA + RPC/WebSocket bridge on Vite's own port),
 * the `@vkontakte/vk-bridge → @vkma.dev/bridge` dev alias, and the FAB +
 * collector script injected into the app page.
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
			config(userConfig) {
				if (options.alias !== false) {
					upsertAlias(userConfig);
				}
			},
			transformIndexHtml() {
				return [
					{
						tag: "script",
						attrs: { type: "module", src: `${base}inject.js` },
						injectTo: "body",
					},
				];
			},
		},
	];
}
