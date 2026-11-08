# VKMA Planner Playground

The single permanent manual-e2e app of the monorepo. Scaffolded once from the
`router` preset of `@vkma.dev/create-app`, then expanded into a planner that
exercises router, bridge, VKUI glue, devtools, API schemas and deploy against
workspace sources.

## Run

```sh
pnpm --filter @vkma.dev/playground dev
```

Devtools surfaces have separate scripts:

```sh
pnpm dev          # standalone /__vkma/ + FAB
pnpm dev:fab      # FAB pinned bottom-left
pnpm dev:hub      # Vite DevTools hub
pnpm dev:mcp      # agent MCP route
```

The app uses the direct `@vkma.dev/bridge` import. Standalone browsers get a
realistic fake host; a real signed VK iframe launch is detected automatically.
Force a mode with `?vkma_host=fake|real` or `VITE_VKMA_HOST=fake|real`.

Open `#/?debug=1` to arm the host lab. It controls appearance, insets,
adaptivity, viewport, latency, success/error/denial outcomes, storage and
host-initiated navigation. `?debug=0` disarms it. The About panel contains the
router deep-link checklist.

Meetings intentionally live in React state and reset on reload. Settings and
the default filter use `VKWebAppStorage`; the fake host persists them locally.
Fake `users.get` fixtures are parsed at runtime by the generated Valibot API
schema.

## Build

```sh
pnpm build
```

This runs strict TypeScript and creates the production bundle in `dist/`.
Browser automation is deliberately out of scope: package tests plus the manual
checklist are the release gate.

## Deploy

A real deploy is opt-in and never runs from build/test/dev commands:

```sh
pnpm exec vkma-deploy login
VKMA_APP_ID=123 pnpm deploy
```

Create the mini app at <https://dev.vk.com/admin/apps-list> first. See the
`@vkma.dev/deploy` README for the full CLI reference.

For the disposable Rsbuild adapter stand, run
`pnpm --filter @vkma.dev/devtools playground:rsbuild` from the repository root.
