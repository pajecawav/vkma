import { join, resolve } from "node:path";
import { devframeViteBridge, type DevframeViteBridgeOptions } from "@devframes/vite/single";
import type { McpSetting } from "devframe/types";
import { resolveStaticAssetsSource } from "devframe/utils/remote-assets";
import { serveStaticNodeMiddleware } from "devframe/utils/serve-static";
import type { Plugin, PluginOption } from "vite";
import { vkmaDevframe } from "./node/definition.ts";
import { injectSnippet } from "./shared/inject-snippet.ts";
import { TAP_IMPORTERS } from "./shared/tap-importers.ts";

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
	 * Mount the panel as a dock inside Vite DevTools (`@vitejs/devtools`)
	 * instead of serving it standalone. Requires `@vitejs/devtools` in the
	 * plugins list (which brings `@vitejs/devtools-kit`); the hub then owns
	 * the SPA mount and the RPC bridge — this plugin keeps only the bridge
	 * interception and the collector injection. Default `false`.
	 */
	hub?: boolean;
	/**
	 * Expose the MCP tools (`vkma:mcp-state`, `vkma:mcp-execute`) at
	 * `<base>__mcp` (Streamable-HTTP) for coding agents and MCP Inspector.
	 * Off by default — the route's only built-in protection is the Origin
	 * check, so turn it on deliberately: pass `true`, or a full
	 * `McpRouteOptions` (bearer `authorization` token, extra `origins`) to
	 * harden a tunnel/LAN setup. Ignored with `hub: true` — the hub owns
	 * its own aggregate MCP endpoint. Default `false`.
	 */
	mcp?: McpSetting;
	/**
	 * WebSocket origin check forwarded to the bridge. Default `false`
	 * (any origin may connect, the interactive OTP auth gate stays the
	 * trust boundary) — needed for `vite --host`, tunnels and phones on
	 * LAN. Pass explicit origins to lock down.
	 */
	allowedOrigins?: DevframeViteBridgeOptions["allowedOrigins"];
	/** Extra options forwarded verbatim to the RPC bridge. */
	bridge?: Omit<DevframeViteBridgeOptions, "base" | "allowedOrigins" | "mcp">;
}

const BRIDGE_PACKAGE = "@vkontakte/vk-bridge";
const TAP_PACKAGE = "@vkma.dev/bridge";

/**
 * The vkma devtools Vite plugin. One line in `vite.config` gives the mini
 * app: the `/__vkma/` panel (SPA + RPC/WebSocket bridge on Vite's own port),
 * the `@vkontakte/vk-bridge → @vkma.dev/bridge` dev interception, and the
 * FAB + collector script injected into the app page.
 */
export function vkmaDevtools(options: VkmaDevtoolsOptions = {}): PluginOption[] {
	const base = options.base ?? "/__vkma/";

	if (options.hub) {
		return [vkmaCorePlugin(base, options), createVkmaHubPlugin()];
	}

	return [
		// Static first: serve-static passes unknown paths through to the
		// bridge's terminal router (which answers `__connection.json`, `__ws`,
		// `__mcp` and `__sse` — without a SPA fallback of its own, so the
		// reserved routes are never eaten).
		vkmaStaticPlugin(base),
		devframeViteBridge(vkmaDevframe, {
			base,
			allowedOrigins: options.allowedOrigins ?? false,
			...options.bridge,
			// MCP off unless asked for — the option owns the route decision
			mcp: options.mcp ?? false,
		}),
		vkmaCorePlugin(base, options),
	];
}

/**
 * Serve the panel's built SPA at `base` — devframeVitePlugin's copy with
 * ONE deliberate difference: `single: false`, no SPA fallback. The
 * fallback answered index.html to every extensionless GET under the base,
 * which ate the bridge's own reserved routes (`__mcp`, `__sse`) before the
 * bridge's terminal router ever saw them: a browser GET on
 * `/__vkma/__mcp` opened the panel instead of the MCP stream. The panel
 * has no client-side router, so it doesn't need the fallback anyway
 * (directory hits resolve via the index candidates, bare `/__vkma` is our
 * 308 redirect).
 */
function vkmaStaticPlugin(base: string): Plugin {
	return {
		name: "vkma-devtools:static",
		apply: "serve",
		configureServer(server) {
			const distDir = vkmaDevframe.clientAssets;
			if (!distDir) {
				return;
			}
			const source = resolveStaticAssetsSource(
				distDir,
				join(process.cwd(), "node_modules", `.${vkmaDevframe.id}`, "devframe"),
				vkmaDevframe.importMetaUrl,
			);
			server.middlewares.use(
				base,
				serveStaticNodeMiddleware(typeof source === "string" ? resolve(source) : source, {
					single: false,
				}),
			);
		},
	};
}

/**
 * The Vite DevTools (`@vitejs/devtools`) dock: `createPluginFromDevframe`
 * delegates the SPA mount, the RPC bridge and `setup(ctx)` to the hub's
 * `ctx.install` — so in hub mode OUR own `devframeVitePlugin` /
 * `devframeViteBridge` must stay out of the list (double mount = double
 * ring buffer). Vite awaits plugin promises, so the kit is imported
 * lazily: it only has to exist when `hub: true` is actually used.
 */
function createVkmaHubPlugin(): Promise<Plugin> {
	return import("@vitejs/devtools-kit/node")
		.then(({ createPluginFromDevframe }) =>
			createPluginFromDevframe(vkmaDevframe, {
				dock: { icon: "ph:boat-duotone", category: "app" },
			}),
		)
		.catch(error => {
			throw new Error(
				`[vkma-devtools] hub: true needs @vitejs/devtools-kit — add @vitejs/devtools to your Vite plugins (pnpm add -D @vitejs/devtools). (${error instanceof Error ? error.message : String(error)})`,
			);
		});
}

/**
 * Bundler-agnostic part of the devtools: the `/__vkma` → `/__vkma/`
 * redirect, the panel URL printout, the `@vkontakte/vk-bridge` dev
 * interception and the FAB/collector injection.
 */
function vkmaCorePlugin(base: string, options: VkmaDevtoolsOptions): Plugin {
	return {
		name: "vkma-devtools",
		apply: "serve",
		enforce: "pre",
		configureServer(server) {
			// `/__vkma` (no trailing slash) serves the panel HTML too, but its
			// relative asset URLs then resolve against the parent directory —
			// white screen. Redirect to the slashed base, query included.
			const bare = base !== "/" ? base.replace(/\/+$/, "") : "";
			if (bare !== "") {
				server.middlewares.use((req, res, next) => {
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

			// unocss-style pointer to the panel: chain the host's printUrls.
			const printUrls = server.printUrls.bind(server);
			server.printUrls = () => {
				printUrls();
				for (const url of server.resolvedUrls?.local ?? []) {
					// eslint-disable-next-line no-console
					console.log(
						`  \x1b[32m➜\x1b[0m  \x1b[1mvkma devtools\x1b[0m  \x1b[2m→\x1b[0m  \x1b[36m${url}${base.slice(1)}\x1b[0m`,
					);
				}
			};
		},
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
			return [
				{
					tag: "script",
					children: injectSnippet(base),
					injectTo: "body",
				},
			];
		},
	};
}
