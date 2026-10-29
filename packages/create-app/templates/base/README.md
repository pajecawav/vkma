# {{appTitle}}

VK Mini App scaffolded with [`@vkma.dev/create-app`](https://github.com/pajecawav/vkma/tree/master/packages/create-app#readme) — preset: **{{presetTitle}}**.

## Develop

```sh
npm install     # or pnpm install / yarn install / bun install
npm run dev     # or pnpm dev / yarn dev / bun run dev
```

The dev server also serves the [vkma.dev devtools](https://github.com/pajecawav/vkma/tree/master/packages/devtools#readme) panel at `/__vkma/` — a live timeline of every bridge event, connected clients and interactive `send`.

## Build

```sh
npm run build   # type-checks (tsc) and bundles into dist/
```

## Deploy

1. Create a mini app at <https://dev.vk.com/mini-apps> and put its id into `vkma-deploy.config.ts` (`appId`).
2. Authorize once: `npx vkma-deploy login`.
3. Deploy: `npm run deploy`.

See the [@vkma.dev/deploy README](https://github.com/pajecawav/vkma/tree/master/packages/deploy#readme) for the full CLI reference.
