# @vkma.dev/create-app

[![npm](https://img.shields.io/npm/v/@vkma.dev/create-app.svg)](https://www.npmjs.com/package/@vkma.dev/create-app)

Scaffold a VK Mini App in seconds: Vite plus the [@vkma.dev](https://github.com/pajecawav/vkma) stack (bridge, devtools, deploy), TypeScript by default.

```sh
npm create @vkma.dev/app my-app
# or: pnpm create @vkma.dev/app my-app · yarn create @vkma.dev/app my-app
# bun: bunx @vkma.dev/create-app my-app
```

## Presets

| Preset             | Stack                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| `base`             | React + Vite + `@vkma.dev/bridge`, devtools panel, deploy, no UI kit          |
| `vkui`             | `base` + VKUI 8, Epic/Tabbar navigation on local state                        |
| `router` (default) | `base` + `@vkma.dev/router` + VKUI, URL-driven views, panels, modals, popouts |

Every generated app ships with:

- `@vkma.dev/bridge`, the bridge with a built-in devtools tap
- the devtools vite plugin, mounting the `/__vkma/` panel (bridge timeline, clients, execute)
- `@vkma.dev/deploy`, shipped as `vkma-deploy.config.ts`, `npm run deploy`, `npx vkma-deploy login`
- TypeScript (strict), `engines`, README, `.gitignore`

The `vkui` and `router` presets also ship `@vkma.dev/vkui-bridge`, a preassembled `<VKBridgeConfigProvider>` (host theme, safe-area insets, adaptivity, `vkcom` platform) wired in `main.tsx`.

## CLI

```
Usage: npm create @vkma.dev/app [path] [flags]

Flags:
  --preset <id>   Preset to scaffold (default: router)
  --pm <id>       Package manager: npm | pnpm | yarn | bun
                  (detected from the invoking command by default)
  --no-install    Skip installing dependencies
  --no-git        Skip git init
  -h, --help      Print this help
```

Interactive when attached to a TTY; fully flag-driven otherwise (CI-friendly).

## Keeping templates fresh

Template dependencies are **exact pins** inside real `package.json` fragments
(`templates/*/package.json`), so Renovate bumps them natively, and every
scaffold hands out current versions. The CLI converts pins to caret ranges when writing
the user's `package.json`.

## Development

```sh
pnpm build        # tsdown → dist/cli.js
pnpm test         # unit tests (registry, fragments, scaffold assembly)
pnpm test:e2e     # scaffold + install + build every preset (needs dist)
```
