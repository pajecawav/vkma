# vkma

Monorepo toolchain for VK Mini Apps.

## Packages

| Package                                                 | Description                                   |
| ------------------------------------------------------- | --------------------------------------------- |
| [`@vkma.dev/bridge`](./packages/bridge)                 | VK Bridge abstraction for VK Mini Apps        |
| [`@vkma.dev/deploy`](./packages/deploy)                 | Deploy CLI & library for VK Mini Apps hosting |
| [`@vkma.dev/devtools-core`](./packages/devtools/core)   | Core utilities for VK Mini Apps devtools      |
| [`@vkma.dev/devtools-react`](./packages/devtools/react) | React bindings for devtools-core              |
| [`@vkma.dev/inspector`](./apps/inspector)               | Chrome/Firefox devtools extension (private)   |
| [`@vkma.dev/web`](./apps/web)                           | Docs & demos site (private)                   |

## Development

```sh
pnpm install
pnpm build
pnpm lint
pnpm test
```

## License

MIT
