# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

SPA on React 19 + Tailwind v4, built with Vite, served by devframe at `/__vkma/` (devframe id: `vkma`). Ships inside `@vkma.dev/devtools` alongside the Vite plugin and the node side. Hosted by the user's own Vite dev server via `devframeViteBridge`.

## Users

VK Mini Apps developers running their mini app on a local dev server (Vite). The primary surface is the developer's desktop browser; the same developer also opens the app on a phone over LAN (`192.168.x.x:5173`) or a tunnel and watches the traffic from the desktop.

## Product Purpose

Show the full VK Bridge dialogue (outgoing `send`, incoming events, launch params) of a mini app under development, live, in one timeline — and let the developer inject bridge events (`execute`) into the running app without the VK environment. Success: the developer never needs the chrome extension or console logging to understand what the app sends and receives.

## Positioning

A devframe-based devtools page (`/__vkma`, like `/__unocss` for UnoCSS) embedded into the app bundle via `@vkma/bridge` (fork of `@vkontakte/vk-bridge` with an `onSend` tap). Replaces the chrome-extension approach: works inside VK's iframe, in standalone, and from a phone through the same dev server — no extension store, no manual console.

## Operating Context

- User app runs on `vite dev`; the plugin auto-injects the FAB and mounts `/__vkma` on the same port.
- Surfaces: standalone `/__vkma` page in a desktop tab; FAB overlay iframe on the mini app page (same SPA, same RPC data source — single source of truth on the node side).
- Remote: phone connects to the same dev server; OTP auth via magic link printed in the terminal; events from all connected clients are merged with source badges.
- The node side keeps a ring buffer (last N events) so a late-opened `/__vkma` sees history.

## Capabilities and Constraints

- Capture: outgoing `send` (via `@vkma/bridge.onSend`), incoming events (`bridge.subscribe`), launch params from the URL.
- Unified timeline with direction/name filters; source badges per connected client; execute with target selector (default: last active).
- Auth always on (devframe interactive OTP); `allowedOrigins` widened by the plugin for LAN/tunnel.
- v0.1 ships as a Vite plugin only; other bundlers use manual alias/import later. React is an optional peer dependency of the package.
- Undecided: ring buffer size N; FAB visual details.

## Brand Commitments

- Minimalist gray/black/white design à la shadcn.
- `~/code/life/packages/ui` (The Quiet Instrument: neutral near-black primary, system font, color only as semantics) is the binding design reference.
- The inspector extension's UI must not be copied; the SPA UI is written from scratch.
- Themes: light and dark, system default (`prefers-color-scheme`) with a persisted manual toggle.

## Evidence on Hand

- The chrome extension (worktree `vk-mini-app-spy`) as a feature reference (event list, execute, mini-app info) — reference only, not for UI.
- `~/code/life/packages/ui` DESIGN.md and sources as the design-language reference.
- Absent: logo, screenshots, docs page. Do not fabricate.

## Product Principles

1. One source of truth: all events flow through the node side; every surface renders the same data.
2. Zero-friction local: install the plugin, open `/__vkma` — no accounts, no config.
3. The tool recedes: neutral palette, platform type; meaning (in/out, error, client) carries the color.
4. Remote is first-class, not a bolt-on: a phone is just another client with a badge.
