# AGENTS.md

Monorepo toolchain for VK Mini Apps. pnpm workspaces, TypeScript strict, ESM-only.

## Structure

- `packages/bridge`, `packages/deploy`, `packages/devtools` — publishable libraries (tsdown: ESM + dts)
- `apps/web` — docs & demos site (bare Astro, no React yet)
- `apps/inspector` — browser extension (rsbuild + Solid, MV3 for chrome & firefox)

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
