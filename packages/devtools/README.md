# @vkma.dev/devtools

Devtools for VK Mini Apps: a `/__vkma/` panel on your own Vite dev server
with a live VK Bridge dialogue (outgoing sends, paired responses, incoming
events), a connected-clients registry and an execute bridge.

## Setup

```sh
# Vite:
pnpm add -D @vkma.dev/devtools @vkma.dev/bridge devframe @devframes/vite
# Rsbuild (no vite needed):
pnpm add -D @vkma.dev/devtools @vkma.dev/bridge devframe
```

Only the adapter you use is a hard dependency: `vite` and `@devframes/vite`
are optional peers (Vite mode), `@rsbuild/core` likewise (Rsbuild mode) —
a Rsbuild app installs the devtools without pulling Vite, and vice versa.

```ts
// vite.config.ts
import { vkmaDevtools } from "@vkma.dev/devtools";

export default {
    plugins: [vkmaDevtools()],
};
```

One line gives the mini app:

- **`/__vkma/`** — the panel (SPA + RPC/WebSocket on Vite's own port, like
  `/__unocss` for UnoCSS).
- **The dev alias** — `@vkontakte/vk-bridge` is aliased to `@vkma.dev/bridge`
  (set `alias: false` to opt out; apps importing `@vkma.dev/bridge` directly
  don't need it), so every importer — dependencies included — runs through
  the devtools tap.
- **The FAB** — a floating button on the app page opening the same panel as
  an overlay.

## What you get

- **Timeline** — a ledger of the bridge traffic: each send opens a request
  group with its paired response nested beneath it (round-trip duration,
  ok/error mark); unsolicited VK events stand alone. Filterable by type
  and name; payloads expand into a collapsible JSON tree with copy.
- **Execute** — send any bridge event into a chosen connected client from
  the panel; the round-trip result lands right there.
- **Clients** — every connected page script (desktop tab, phone on LAN,
  iframe, standalone) with UA, platform, launch params.
- **Embedded scope** — the FAB panel shows only its own page's traffic
  (colored client badge in the header); a page reload resets its history.
- **MCP for coding agents** — off by default; turn on with
  `vkmaDevtools({ mcp: true })` (or a full `McpRouteOptions` — bearer
  `authorization` token, extra `origins` — for tunnel/LAN setups). The
  same timeline and execute are exposed as MCP tools (`vkma:mcp-state`,
  `vkma:mcp-execute`) at `/__vkma/__mcp` (Streamable-HTTP), so agents
  like OpenCode or Claude Code can read the bridge traffic and drive
  `execute` programmatically. Event payloads are JSON-sanitized on this
  surface. In hub mode the hub owns its own aggregate MCP endpoint.

## Remote (phone on LAN / tunnel)

Run Vite with `--host`. Auth is always on: the first browser connects via
the OTP printed in the dev server terminal (or the one-click link it
prints). The WebSocket origin check is open by default — the OTP gate is
the trust boundary; pass `allowedOrigins` to lock it down.

## Vite DevTools dock (hub mode)

With [`@vitejs/devtools`](https://devtools.vite.dev/) installed, mount the
panel as one of its docks instead of standalone:

```ts
import { DevTools } from "@vitejs/devtools";
import { vkmaDevtools } from "@vkma.dev/devtools";

export default {
    plugins: [DevTools(), vkmaDevtools({ hub: true })],
};
```

The hub then owns the panel mount and the RPC bridge (one WebSocket and one
auth gate shared with every other dock); our plugin keeps the bridge
interception and the FAB/collector injection. The MCP tools aggregate into
the hub's endpoint (`/__devtools/__mcp`). Without `hub: true` nothing
changes — the standalone `/__vkma/` + FAB setup runs exactly as before,
with or without Vite DevTools present.

## Non-Vite bundlers

**Rsbuild / rspack** — first-class via the `@vkma.dev/devtools/rsbuild`
subpath:

```ts
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { vkmaDevtoolsRsbuild } from "@vkma.dev/devtools/rsbuild";

export default defineConfig({
    plugins: [pluginReact(), vkmaDevtoolsRsbuild()],
});
```

Same one-liner as Vite: the `/__vkma/` panel (RPC bridge rides a
side-car WebSocket — Rsbuild never hands over HTTP upgrades), the
`@vkontakte/vk-bridge → @vkma.dev/bridge` interception (issuer-aware, the
tap itself keeps the original), the FAB + collector injection. Requires
`@rsbuild/core` >= 1.0. See `playground/mini-app-rsbuild`.

**Any other bundler / server** — import `@vkma.dev/bridge` instead of
`@vkontakte/vk-bridge` (or alias it yourself, skipping imports from inside
the tap package) and mount the panel yourself via `initDevframe` — see
the `vkmaDevframe` export.
