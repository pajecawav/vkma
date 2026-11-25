# vkma

Monorepo toolchain for VK Mini Apps.

## Packages

| Package                                               | Description                                             |
| ----------------------------------------------------- | ------------------------------------------------------- |
| [`@vkma.dev/create-app`](./packages/create-app)       | Scaffold a VK Mini App (base, VKUI, router presets)     |
| [`@vkma.dev/bridge`](./packages/bridge)               | Independent VK Bridge for VK Mini Apps                  |
| [`@vkma.dev/deploy`](./packages/deploy)               | Deploy CLI & library for VK Mini Apps hosting           |
| [`@vkma.dev/devtools`](./packages/devtools)           | Devtools panel on your own dev server                   |
| [`@vkma.dev/router`](./packages/router)               | TanStack-based router for VK Mini Apps (pre-release)    |
| [`@vkma.dev/tunnel`](./packages/tunnel)               | Public HTTPS tunnels for local dev servers (CLI, Vite)  |
| [`@vkma.dev/vkui-bridge`](./packages/vkui-bridge)     | React glue between @vkma.dev/bridge and VKUI            |
| [`@vkma.dev/bridge-schema`](./packages/bridge-schema) | JSON Schema catalogue of VK Bridge events + TS types    |
| [`@vkma.dev/api-schema`](./packages/api-schema)       | Generated TS types + zod/valibot schemas for the VK API |

## Apps (private)

| App                                                         | Description                                     |
| ----------------------------------------------------------- | ----------------------------------------------- |
| [`@vkma.dev/devtools-extension`](./apps/devtools-extension) | Browser extension: the panel on arbitrary pages |
| [`@vkma.dev/inspect`](./apps/inspect)                       | Remote inspector over WebRTC (phone, prod)      |
| [`@vkma.dev/docs`](./apps/docs)                             | The vkma.dev docs site (Starlight on Astro)     |

## Development

```sh
pnpm install
pnpm build
pnpm lint
pnpm test
```

## License

MIT.
