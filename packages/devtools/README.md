# @vkma.dev/devtools

Devtools for VK Mini Apps: a `/__vkma/` panel on your own Vite dev server
with a live VK Bridge dialogue (outgoing sends, paired responses, incoming
events), a connected-clients registry and an execute bridge.

## Setup

```sh
pnpm add -D @vkma.dev/devtools @vkma.dev/bridge devframe @devframes/vite
```

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

- **Timeline** — the bridge dialogue: outgoing sends on the right, incoming
  events and paired responses (with durations) on the left, filterable by
  direction and name. Payload JSON copies with one click.
- **Execute** — send any bridge event into a chosen connected client from
  the panel; the round-trip result lands right there.
- **Clients** — every connected page script (desktop tab, phone on LAN,
  iframe, standalone) with UA, platform, launch params.

## Remote (phone on LAN / tunnel)

Run Vite with `--host`. Auth is always on: the first browser connects via
the OTP printed in the dev server terminal (or the one-click link it
prints). The WebSocket origin check is open by default — the OTP gate is
the trust boundary; pass `allowedOrigins` to lock it down.

## Non-Vite bundlers

Import `@vkma.dev/bridge` instead of `@vkontakte/vk-bridge` (or alias it
yourself) and serve the panel yourself via `initDevframe` — see
`vkmaDevframe` export.
