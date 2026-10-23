# AGENTS.md

Monorepo toolchain for VK Mini Apps. pnpm workspaces, TypeScript strict, ESM-only.

## Structure

- `packages/bridge`, `packages/deploy`, `packages/devtools` — publishable libraries (tsdown: ESM + dts)
- `apps/web` — docs & demos site (bare Astro, no React yet)
- `apps/inspector` — browser extension (rsbuild + Solid, MV3 for chrome & firefox)
- `playground/mini-app` — fake mini app for manual e2e of the devtools (imports the original `@vkontakte/vk-bridge` so the plugin's interception is what routes it through the tap)

## Devtools architecture (`packages/devtools`)

Read `packages/devtools/PRODUCT.md` for product truth and `DESIGN.md` for the visual system. The non-obvious invariants:

- **Single source of truth**: events live in the node side's ring buffer (500) and flow to every surface over devframe RPC. The FAB iframe and the standalone `/__vkma/` tab render the same data; do not add client-side-only event paths.
- **The tap is on `globalThis`**: `@vkma.dev/bridge` publishes `{ tap, send }` as `globalThis.__vkmaDevtoolsBridge`. The inject collector finds it there — it never shares a module graph with the app. The tap's buffer (500) replays to the first subscriber, so the collector may attach after the app started sending.
- **Interception is a resolveId hook, not an alias**: the vite plugin redirects `@vkontakte/vk-bridge` imports via an `enforce: "pre"` `resolveId` that must SKIP importers inside the tap package itself — otherwise the wrapper imports itself (TDZ crash). Do not replace this with `resolve.alias`.
- **Inject loading order**: the plugin injects a plain (non-module) script that sets `globalThis.__VKMA_DEVTOOLS_BASE__` and appends the module tag at runtime. Deriving the base from `import.meta.url` breaks when a dev pipeline inlines the module as a data: URL; letting Vite rewrite a module `src` in index.html breaks too. The collector waits for the bridge handle (`waitForBridge`) because dynamic module insertion races the app's graph.
- **Mount order**: the static SPA mount comes BEFORE `devframeViteBridge` — the bridge's router is terminal and would 404 the panel files. The plugin's `configureServer` also 308-redirects `/__vkma` (no slash) to `/__vkma/` — relative asset URLs in the panel HTML resolve against the parent directory otherwise — and chains `server.printUrls` (unocss-style) to print the panel URL on `pnpm dev`.
- **Sessions**: the collector sends a per-page-load `sessionId` in `vkma:hello`; when the node side sees a new session for a known client it purges that client's history and broadcasts `vkma:on-session-reset`. Client ids persist across reloads (sessionStorage), session ids do not. `connectedAt` is first-seen per session — the store pins it against heartbeat re-stamps — and anchors the registry order and the "connected N ago" label.
- **Duplicate tabs yield their copied client id**: "Duplicate Tab" copies sessionStorage, so two live tabs could share one clientId — interleaved traffic in a single card and its history wiped every heartbeat (alternating sessionIds). The inject runs a BroadcastChannel claim handshake on `vkma:client-ids`: an incumbent answers `taken`, the claiming tab mints a fresh id; claims are re-asserted every 30s so a duplicate whose twin was timer-frozen also settles. A plain reload (sole holder) keeps its id.
- **Clients never vanish on a timer**: Chrome throttles background-tab timers, so heartbeat-based deletion would flap clients offline/online. Past the 15s heartbeat TTL a client is marked `online: false` (dimmed card, "offline" chip) and only the registry cap (24, oldest offline first) ever drops entries. The inject says hello immediately on `visibilitychange` so a refocused tab comes back online instantly.
- **Embedded mode**: the FAB appends `?client=<id>` to the panel iframe; `useVkma(clientId)` then scopes state/events/execute to that client and hides the Clients tab and target selector.
- **Embedded panels are scoped on the node, not in the panel**: the `?client=` session calls `vkma:subscribe { clientId }` right after connect, and the node then delivers only that client's events/registry/resets via targeted broadcasts (filter identity: `client.$meta === session.meta`) plus a scoped `vkma:state` snapshot. `/__vkma` standalone keeps the full feed. The panel's local filters are a race net, not the mechanism; `vkma:execute` rejects cross-scope targets with the `forbidden` ExecResult. Standalone `/__vkma/` shows everything plus a per-client switcher in the filter row.
- **Client colors are deterministic**: djb2 hash over a curated 8-tone palette in `src/shared/colors.ts` (raw hex — the FAB's shadow DOM paints its outlined glyph's stroke with it; the FAB re-paints when a duplicated tab yields its copied id). The panel maps indexes to Tailwind classes in `app/src/lib/colors.ts`. Same client → same color everywhere (timeline badges, client cards, header badge, FAB glyph stroke). Never derive them from registry order or random values.
- **Event dedupe**: delivered events are merged by `seq` (globally unique, assigned by the node side) in `useVkma` — closes the snapshot+subscribe race and double deliveries. `data-seq` on timeline rows is the e2e assertion hook.
- **`vk-connect` is transport chatter**: the collector drops it before reporting; don't surface internal bridge protocol events in the timeline.
- **Sensitive params** (`sign`, `access_token`, `auth_key`, `sid`) are blurred in the Clients launch-params grid — keep the set in sync with the inspector extension (`MiniAppPanel.tsx`).
- **Wire names** live in `src/shared/protocol.ts` (`VKMA_RPC` + the `DevframeRpcClientFunctions` augmentation). Browser-registered functions must be declared there or broadcasts/registers stop type-checking.
- **SPA builds**: `pnpm build` in the package = SPA (`app/` → `dist-client/`, base `./`) → inject bundle (`vite.inject.config.ts` → `dist-client/inject.js`, don't flip `emptyOutDir`) → tsdown lib. `dist-client` ships in the npm package and is git-ignored. Always run the full `pnpm build` in the package — a lone `build:client` wipes `dist-client` (including `inject.js`) before re-adding it.
- **JsonTree** (`app/src/components/JsonTree.tsx` + `JsonTree.module.css`): hand-rolled collapsible viewer (devframe ships none; json-render is a UI spec). CSS modules + light/dark token sets; nodes are memoized.

## Commands (root)

- `pnpm build` / `pnpm dev` — recursive over all workspaces
- `pnpm lint` — oxlint + `tsc -b --noEmit` + apps typecheck + `pt format --check` + publint (run `pnpm build` first: publint needs `dist/`)
- `pnpm test` — vitest per package
- `pnpm format` — oxfmt via `pt format`

## Conventions

- Shared dependency versions live in the `catalog:` section of `pnpm-workspace.yaml`.
- Publishing: changesets (`pnpm changeset`, `pnpm version`). Apps stay private.
- Changeset summaries stay one short line — the details belong in the commit message, not the changelog.
- Inspector browser target: `BROWSER=firefox|chrome` (default chrome), two static manifests in `apps/inspector/src/`, `web-ext` to run/pack.
- Node >= 22.18 (type stripping for generator scripts), dev machine version pinned in `.node-version`.
