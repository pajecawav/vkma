---
title: devtools
description: "The /__vkma/ panel on your dev server: live bridge traffic, clients and execute."
sidebar:
    order: 0
    label: "Overview"
---

`@vkma.dev/devtools` is devtools for VK Mini Apps: a `/__vkma/` panel on your own dev server with live VK Bridge traffic (outgoing sends, paired responses, incoming events), a connected-clients registry and execute.

```sh
# Vite:
npm install -D @vkma.dev/devtools @vkma.dev/bridge devframe @devframes/vite
# Rsbuild (no vite needed):
npm install -D @vkma.dev/devtools @vkma.dev/bridge devframe
```

Only the adapter you use is a hard dependency: `vite` and `@devframes/vite` are optional peers (Vite mode), and `@rsbuild/core` likewise (Rsbuild mode).

```ts
// vite.config.ts
import { vkmaDevtools } from "@vkma.dev/devtools";

export default {
    plugins: [vkmaDevtools()],
};
```

One line gives the mini app:

- **`/__vkma/`.** The panel (SPA + RPC/WebSocket on Vite's own port, like `/__unocss` for UnoCSS).
- **The bridge alias.** `@vkontakte/vk-bridge` imports, dependencies included, are rewritten to `@vkma.dev/bridge` with the devtools tap. No app code changes are needed. Opt out with `alias: false`.
- **The FAB.** A floating button on the app page opening the same panel as an overlay. Its initial placement is configurable: `vkmaDevtools({ fabPosition: "bottom-left" })` (`bottom-left`, `bottom` or `bottom-right`, default `bottom-left`); a placement picked in the panel is remembered per origin and wins over the configured initial value.

## What you get

- **Timeline.** A log of the bridge traffic: each send opens a request group with its paired response nested beneath it (round-trip duration, ok/error mark); unsolicited VK events stand alone. Filterable by type and name; payloads expand into a collapsible JSON tree with copy.
- **Execute.** Send any bridge event into a chosen connected client from the panel; the round-trip result lands right there.
- **Clients.** Every connected page script (desktop tab, phone on LAN, iframe, standalone) with UA, platform, launch params.
- **Embedded scope.** The FAB panel shows only its own page's traffic (colored client badge in the header); a page reload resets its history.
- **MCP for coding agents.** Off by default; turn on with the `mcp` option.

## Next

- [Vite plugin](/en/devtools/vite/) — setup and the `vkmaDevtools` options.
- [Rsbuild adapter](/en/devtools/rsbuild/) — the same panel without Vite.
- [The panel](/en/devtools/panel/) — timeline, execute, clients, the embedded scope.
- [MCP](/en/devtools/mcp/) — bridge traffic and execute for coding agents.

## Links

- [npm: @vkma.dev/devtools](https://www.npmjs.com/package/@vkma.dev/devtools)
