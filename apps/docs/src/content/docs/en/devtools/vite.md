---
title: "Vite plugin"
description: "vkmaDevtools in vite.config: the /__vkma/ panel, the bridge alias and the FAB in one line."
sidebar:
    order: 1
---

Install the devtools, the [bridge](/en/bridge/) and the devframe Vite adapter:

```sh
npm install -D @vkma.dev/devtools @vkma.dev/bridge devframe @devframes/vite
```

Add the plugin to `vite.config.ts`:

```ts
import { vkmaDevtools } from "@vkma.dev/devtools";

export default {
    plugins: [vkmaDevtools()],
};
```

Run `vite dev`. Next to the app URL the terminal prints `vkma devtools → http://localhost:5173/__vkma/`. What lives inside the panel is covered in [its tour](/en/devtools/panel/).

## What the plugin does

- **The `/__vkma/` panel.** An SPA with RPC/WebSocket on Vite's own port, like `/__unocss` for UnoCSS. No extra server is started. `/__vkma` without a trailing slash 308-redirects to `/__vkma/`.
- **The bridge alias.** Imports of `@vkontakte/vk-bridge`, from dependencies too, resolve to `@vkma.dev/bridge` with a built-in tap, so the panel sees all of the app's traffic without touching the app's code.
- **The FAB.** A floating button on the app page opens the same panel as an overlay.

## Options

```ts
vkmaDevtools({
    base: "/__vkma/",
    alias: true,
    fabPosition: "bottom-left",
    mcp: false,
    allowedOrigins: false,
    hub: false,
});
```

| Option           | Type                                              | Default         | What it does                                                                                |
| ---------------- | ------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------- |
| `base`           | `string`                                          | `"/__vkma/"`    | Base for the panel, the RPC bridge and the [MCP route](/en/devtools/mcp/)                   |
| `alias`          | `boolean`                                         | `true`          | Alias `@vkontakte/vk-bridge` → `@vkma.dev/bridge` in the dev build                          |
| `fabPosition`    | `"bottom-left"` \| `"bottom"` \| `"bottom-right"` | `"bottom-left"` | Initial FAB placement; a placement picked in the panel is remembered per origin and wins    |
| `mcp`            | `boolean` or an `McpRouteOptions` object          | `false`         | [MCP tools](/en/devtools/mcp/) at `<base>__mcp` for coding agents                           |
| `allowedOrigins` | `false` or a list of origins                      | `false`         | WebSocket `Origin` check; `false` means any origin (the OTP gate stays the trust boundary)  |
| `hub`            | `boolean`                                         | `false`         | Mount the panel as a [Vite DevTools](#vite-devtools-dock) dock instead of a standalone page |
| `bridge`         | object                                            | —               | Extra RPC-bridge options, forwarded verbatim to `devframeViteBridge`                        |

The plugin runs in dev only (`apply: "serve"`) and leaves production builds untouched.

## Importing @vkma.dev/bridge directly

If the app imports `@vkma.dev/bridge` itself, the alias is redundant. The package publishes its own tap and the collector finds it. Turn the interception off:

```ts
vkmaDevtools({ alias: false });
```

The alias exists for exactly one job: routing someone else's `@vkontakte/vk-bridge` imports through the tap as well.

## Phones and tunnels

Run `vite --host` and open the app from a phone on your LAN. It becomes another panel client. The first browser connection goes through an OTP gate: a one-time code is printed in the dev server terminal (with a one-click link next to it); trusted browsers are remembered. The WebSocket `Origin` check is open by default, so the OTP stays the trust boundary. Pass `allowedOrigins: ["http://192.168.1.5:5173"]` to close the Origin check as well.

## Vite DevTools dock

With [`@vitejs/devtools`](https://devtools.vite.dev/) installed, mount the panel as one of its docks instead of a standalone page:

```ts
import { DevTools } from "@vitejs/devtools";
import { vkmaDevtools } from "@vkma.dev/devtools";

export default {
    plugins: [DevTools(), vkmaDevtools({ hub: true })],
};
```

The hub then owns the panel and the RPC; the plugin keeps the bridge interception and the FAB. [MCP](/en/devtools/mcp/) aggregates into the hub's endpoint `/__devtools/__mcp` and the `mcp` option is ignored. Without `hub: true` nothing changes, with or without Vite DevTools present.

## Next

- [The panel](/en/devtools/panel/) — timeline, execute, clients.
- [MCP](/en/devtools/mcp/) — bridge traffic and execute for coding agents.
