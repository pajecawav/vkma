import type { RsbuildPlugin } from "@rsbuild/core";
import { rspack } from "@rsbuild/core";
import { initDevframe, type DevframeInstance } from "devframe/initiate";
import type { McpSetting } from "devframe/types";
import { vkmaDevframe } from "../node/definition.ts";
import { injectSnippet } from "../shared/inject-snippet.ts";
import { TAP_IMPORTERS } from "../shared/tap-importers.ts";

export interface VkmaRsbuildOptions {
	/** Mount base for the panel and the RPC bridge. Default `/__vkma/`. */
	base?: string;
	/**
	 * Rewrite `@vkontakte/vk-bridge` imports to `@vkma.dev/bridge` in dev so
	 * every importer in the app (dependencies included) runs through the tap.
	 * Set `false` when the app imports `@vkma.dev/bridge` itself.
	 * Default `true`. Applies to the rspack bundler chain only.
	 */
	alias?: boolean;
	/**
	 * Expose the MCP tools (`vkma:mcp-state`, `vkma:mcp-execute`) at
	 * `<base>__mcp` (Streamable-HTTP) for coding agents and MCP Inspector.
	 * Off by default — the route's only built-in protection is the Origin
	 * check, so turn it on deliberately: pass `true`, or a full
	 * `McpRouteOptions` (bearer `authorization` token, extra `origins`) to
	 * harden a tunnel/LAN setup. Default `false`.
	 */
	mcp?: McpSetting;
	/**
	 * WebSocket origin check forwarded to the bridge. Default `false`
	 * (any origin may connect; the interactive OTP auth gate is the trust
	 * boundary) — needed for tunnels and phones on LAN. Pass explicit
	 * origins to lock down.
	 */
	allowedOrigins?: false | readonly string[];
	/**
	 * Initial placement of the in-page FAB. Default `bottom-left`. A
	 * placement picked in the panel is stored per origin (localStorage)
	 * and wins over this initial value. Mirrors `FabPosition` of
	 * `@vkma.dev/ui/fab-position`.
	 */
	fabPosition?: "bottom-left" | "bottom" | "bottom-right";
}

const BRIDGE_PACKAGE = "@vkontakte/vk-bridge";
const TAP_PACKAGE = "@vkma.dev/bridge";

/** The devframe instance survives Rsbuild dev-server restarts (side-car WS). */
const INSTANCE_KEY = "__vkmaDevtoolsInstance__";

function getDevframeInstance(
	base: string,
	allowedOrigins: false | readonly string[],
	mcp: McpSetting | undefined,
): DevframeInstance {
	const store = globalThis as typeof globalThis & {
		[INSTANCE_KEY]?: DevframeInstance;
	};
	if (store[INSTANCE_KEY] && store[INSTANCE_KEY].base === base) {
		return store[INSTANCE_KEY];
	}
	const instance = initDevframe(vkmaDevframe, {
		base,
		// Rsbuild's connect stack never hands over HTTP upgrades, so the
		// RPC socket runs as a side-car WS server on its own port; the
		// client discovers it via `<base>__connection.json`.
		ws: { sidecar: true },
		allowedOrigins,
		// MCP off unless asked for — the option owns the route decision
		mcp: mcp ?? false,
	});
	store[INSTANCE_KEY] = instance;
	return instance;
}

/**
 * The vkma devtools Rsbuild plugin — the `@vkma.dev/devtools/rsbuild`
 * counterpart of the Vite plugin: the `/__vkma/` panel (SPA + RPC bridge,
 * WS side-car), the `@vkontakte/vk-bridge → @vkma.dev/bridge` dev
 * interception, and the FAB + collector script injected into the app page.
 */
export function vkmaDevtoolsRsbuild(options: VkmaRsbuildOptions = {}): RsbuildPlugin {
	const base = options.base ?? "/__vkma/";

	return {
		name: "vkma-devtools",
		setup(api) {
			const dev = api.context.action === "dev";

			api.modifyBundlerChain((chain, { isDev }) => {
				if (!isDev || options.alias === false) {
					return;
				}
				// rspack's `resolve.alias` is importer-agnostic, which would
				// loop our tap package onto itself — the replacement plugin
				// sees the importer's directory and can skip the tap itself,
				// the same rule the Vite plugin's resolveId applies.
				chain.plugin("vkma-devtools-alias").use(rspack.NormalModuleReplacementPlugin, [
					new RegExp(`^${BRIDGE_PACKAGE.replace("/", "\\/")}$`),
					(data: { request?: string; context?: string }) => {
						if (data.context && TAP_IMPORTERS.test(data.context)) {
							return;
						}
						data.request = TAP_PACKAGE;
					},
				]);
			});

			api.modifyRsbuildConfig(config => {
				if (!dev) {
					return;
				}
				// Same snippet as the Vite plugin: a plain (non-module) script
				// pins the base global and appends the real module tag at
				// runtime, after the app's own scripts (also when the tag
				// lands in <head> before <body> is parsed).
				config.html ??= {};
				const tag = {
					tag: "script",
					children: injectSnippet(base, { fabPosition: options.fabPosition }),
					append: true,
				};
				if (config.html.tags === undefined) {
					config.html.tags = [tag];
				} else if (Array.isArray(config.html.tags)) {
					config.html.tags = [...config.html.tags, tag];
				} else {
					config.html.tags = [config.html.tags, tag];
				}

				config.server ??= {};
				const setup = config.server.setup;
				const setupList = setup === undefined ? [] : Array.isArray(setup) ? setup : [setup];
				config.server.setup = [
					...setupList,
					ctx => {
						if (ctx.action !== "dev") {
							return;
						}
						const instance = getDevframeInstance(
							base,
							options.allowedOrigins ?? false,
							options.mcp,
						);
						// `/__vkma` (no trailing slash) would resolve the panel's
						// relative asset URLs against the parent directory —
						// white screen. Redirect to the slashed base, query included.
						const bare = base.replace(/\/+$/, "");
						if (bare !== "") {
							ctx.server.middlewares.use((req, res, next) => {
								const url = req.url ?? "";
								const path = url.split("?")[0];
								if (path !== bare) {
									next();
									return;
								}
								res.statusCode = 308;
								res.setHeader("Location", `${base}${url.slice(path.length)}`);
								res.end();
							});
						}
						ctx.server.middlewares.use(instance.nodeMiddleware);
					},
				];
			});

			api.onAfterStartDevServer(({ port, routes }) => {
				for (const route of routes) {
					// eslint-disable-next-line no-console
					console.log(
						`  \x1b[32m➜\x1b[0m  \x1b[1mvkma devtools\x1b[0m  \x1b[2m→\x1b[0m  \x1b[36mhttp://localhost:${port}${route.pathname}${base.slice(1)}\x1b[0m`,
					);
				}
			});
		},
	};
}

export { vkmaDevframe };
