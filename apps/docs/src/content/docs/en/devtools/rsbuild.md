---
title: "vkmaDevtoolsRsbuild: the devtools panel in Rsbuild"
description: "vkmaDevtoolsRsbuild: the same /__vkma/ panel in Rsbuild, no Vite involved."
sidebar:
    order: 2
    label: "Rsbuild adapter"
---

An Rsbuild app needs no Vite. The adapter lives at the `@vkma.dev/devtools/rsbuild` subpath:

```sh
npm install -D @vkma.dev/devtools @vkma.dev/bridge devframe
# or: pnpm add -D / yarn add -D / bun add -D
```

The peer dependency is `@rsbuild/core` >= 1.0. Add the plugin in `rsbuild.config.ts`:

```ts
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { vkmaDevtoolsRsbuild } from "@vkma.dev/devtools/rsbuild";

export default defineConfig({
    plugins: [pluginReact(), vkmaDevtoolsRsbuild()],
});
```

A `vkma devtools → …` line prints at dev-server startup next to the app URLs.

## Differences from the Vite version

The URL and the auth are the same as the Vite version's: the panel at `/__vkma/`, the OTP gate on first connect. The connection survives dev-server restarts, history is kept.

Everything else matches the [Vite plugin](/en/devtools/vite/):

- **The `/__vkma/` panel** with the same data ([tour](/en/devtools/panel/)).
- **The `@vkontakte/vk-bridge` → `@vkma.dev/bridge` interception** across the whole module graph.
- **The FAB** on the app page with the same placements.
- **The [MCP route](/en/devtools/mcp/)** with the same trust modes.

## Options

```ts
vkmaDevtoolsRsbuild({
    base: "/__vkma/",
    alias: true,
    fabPosition: "bottom-left",
    mcp: false,
    allowedOrigins: false,
});
```

| Option           | Type                                              | Default         | What it does                                                                                     |
| ---------------- | ------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| `base`           | `string`                                          | `"/__vkma/"`    | Base for the panel, the RPC bridge and the MCP route                                             |
| `alias`          | `boolean`                                         | `true`          | Rewrite `@vkontakte/vk-bridge` imports; `false` when the app imports `@vkma.dev/bridge` directly |
| `fabPosition`    | `"bottom-left"` \| `"bottom"` \| `"bottom-right"` | `"bottom-left"` | Initial FAB placement; a placement picked in the panel is remembered per origin and wins         |
| `mcp`            | `boolean` or an `McpRouteOptions` object          | `false`         | MCP tools at `<base>__mcp`                                                                       |
| `allowedOrigins` | `false` or a list of origins                      | `false`         | WebSocket `Origin` check                                                                         |

Differences from the Vite version: no `hub` (the Vite DevTools dock) and no `bridge` (fine-grained RPC tuning). The bridge interception applies to the rspack bundler chain only.

## Next

- [The panel](/en/devtools/panel/) — timeline, execute, clients.
- [MCP](/en/devtools/mcp/) — bridge traffic and execute for coding agents.
