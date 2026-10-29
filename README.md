# vkma

Monorepo toolchain for VK Mini Apps.

## Packages

| Package                                               | Description                                             |
| ----------------------------------------------------- | ------------------------------------------------------- |
| [`@vkma.dev/bridge`](./packages/bridge)               | Independent VK Bridge for VK Mini Apps                  |
| [`@vkma.dev/bridge-schema`](./packages/bridge-schema) | JSON Schema catalogue of VK Bridge events + TS types    |
| [`@vkma.dev/api-schema`](./packages/api-schema)       | Generated TS types + zod/valibot schemas for the VK API |
| [`@vkma.dev/deploy`](./packages/deploy)               | Deploy CLI & library for VK Mini Apps hosting           |
| [`@vkma.dev/devtools`](./packages/devtools)           | Devtools panel on your own dev server                   |
| [`@vkma.dev/router`](./packages/router)               | TanStack-based router for VK Mini Apps (pre-release)    |

## Apps (private)

| App                                                         | Description                                     |
| ----------------------------------------------------------- | ----------------------------------------------- |
| [`@vkma.dev/devtools-extension`](./apps/devtools-extension) | Browser extension: the panel on arbitrary pages |
| [`@vkma.dev/inspect`](./apps/inspect)                       | Remote inspector over WebRTC (phone, prod)      |
| [`@vkma.dev/web`](./apps/web)                               | Docs & demos site                               |

## Development

```sh
pnpm install
pnpm build
pnpm lint
pnpm test
```

## License

MIT.
