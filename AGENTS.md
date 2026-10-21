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
- **Mount order**: the static SPA mount comes BEFORE `devframeViteBridge` — the bridge's router is terminal and would 404 the panel files.
- **Sessions**: the collector sends a per-page-load `sessionId` in `vkma:hello`; when the node side sees a new session for a known client it purges that client's history and broadcasts `vkma:on-session-reset`. Client ids persist across reloads (sessionStorage), session ids do not.
- **Sensitive params** (`sign`, `access_token`, `auth_key`, `sid`) are blurred in the Clients launch-params grid — keep the set in sync with the inspector extension (`MiniAppPanel.tsx`).
- **Wire names** live in `src/shared/protocol.ts` (`VKMA_RPC` + the `DevframeRpcClientFunctions` augmentation). Browser-registered functions must be declared there or broadcasts/registers stop type-checking.
- **SPA builds**: `pnpm build` in the package = SPA (`app/` → `dist-client/`, base `./`) → inject bundle (`vite.inject.config.ts` → `dist-client/inject.js`, don't flip `emptyOutDir`) → tsdown lib. `dist-client` ships in the npm package and is git-ignored.

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
- Node >= 22, dev machine version pinned in `.node-version`.
