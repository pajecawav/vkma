# {{appTitle}}

VK Mini App scaffolded with [`@vkma.dev/create-app`](https://github.com/pajecawav/vkma/tree/master/packages/create-app#readme) — preset: **{{presetTitle}}**.

## Develop

```sh
npm install     # or pnpm install / yarn install / bun install
npm run dev     # or pnpm dev / yarn dev / bun run dev
```

The dev server also serves the [vkma.dev devtools](https://github.com/pajecawav/vkma/tree/master/packages/devtools#readme) panel at `/__vkma/` — a live timeline of every bridge event, connected clients and interactive `send`.

## Tunnel

[`@vkma.dev/tunnel`](https://github.com/pajecawav/vkma/tree/master/packages/tunnel#readme) gives the dev server a public HTTPS address with a stable per-project URL — open the app on a phone or wire the address into the VK app settings, without deploying. It is wired in but **off by default**; enable it one way:

- `enabled: true` on `vkmaTunnel()` in `vite.config.ts` — the tunnel starts together with the dev server and prints its URL next to Vite's own;
- or leave the plugin off and run `npm run tunnel` (or pnpm / yarn / bun) in a second terminal while the dev server runs.

Use one of the two, not both: they share the project's tunnel profile and would fight over its route. The URL is public — anyone who has it reaches your dev server.

## Build

```sh
npm run build   # type-checks (tsc) and bundles into dist/
```

## Deploy

1. Create a mini app at <https://dev.vk.com/admin/apps-list> and put its id into `vkma-deploy.config.ts` (`appId`).
2. Authorize once: `npx vkma-deploy login`.
3. Deploy: `npm run deploy`.

See the [@vkma.dev/deploy README](https://github.com/pajecawav/vkma/tree/master/packages/deploy#readme) for the full CLI reference.
