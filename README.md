# vkma

Monorepo toolchain for VK Mini Apps.

## Packages

| Package                                     | Description                                   |
| ------------------------------------------- | --------------------------------------------- |
| [`@vkma.dev/bridge`](./packages/bridge)     | VK Bridge abstraction for VK Mini Apps        |
| [`@vkma.dev/deploy`](./packages/deploy)     | Deploy CLI & library for VK Mini Apps hosting |
| [`@vkma.dev/devtools`](./packages/devtools) | Devtools for VK Mini Apps                     |
| [`@vkma.dev/inspector`](./apps/inspector)   | Chrome/Firefox devtools extension (private)   |
| [`@vkma.dev/web`](./apps/web)               | Docs & demos site (private)                   |

## Development

```sh
pnpm install
pnpm build
pnpm lint
pnpm test
```

## License

MIT
