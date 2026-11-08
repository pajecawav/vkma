---
title: Getting started
description: What vkma.dev is, a quick start with create-app, and the package map.
---

vkma.dev is a toolkit for VK Mini Apps: an independent platform bridge, a router, a devtools panel, a deploy CLI, and typed schemas for bridge events and the VK API. The packages live under the `@vkma.dev` npm scope and work separately: take just the bridge, or the whole stack.

## Quick start

```sh
npm create @vkma.dev/app my-app
```

The CLI scaffolds the project, installs dependencies, and inits git. Presets are picked interactively; without a TTY, pass flags:

```sh
npm create @vkma.dev/app my-app -- --preset router --pm pnpm
```

| Preset             | Stack                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| `base`             | React + Vite + `@vkma.dev/bridge`, devtools panel, deploy, no UI kit          |
| `vkui`             | `base` + VKUI 8, Epic/Tabbar navigation on local state                        |
| `router` (default) | `base` + `@vkma.dev/router` + VKUI, URL-driven views, panels, modals, popouts |

Then:

```sh
cd my-app
npm run dev
```

The devtools panel is already wired into the dev server: open `/__vkma/` and watch the whole bridge dialogue live.

## Packages

| Package                               | What it does                                                              |
| ------------------------------------- | ------------------------------------------------------------------------- |
| [`create-app`](/en/create-app/)       | scaffolder: a Vite app in one command                                     |
| [`bridge`](/en/bridge/)               | independent VK Bridge: `send`/`subscribe`, timeouts, an observability tap |
| [`router`](/en/router/)               | a router on TanStack Router: views, panels, modals and popouts as URLs    |
| [`vkui-bridge`](/en/vkui-bridge/)     | a React provider: host theme, insets and adaptivity wired into VKUI       |
| [`devtools`](/en/devtools/)           | the `/__vkma/` panel on your dev server: timeline, execute, clients       |
| [`deploy`](/en/deploy/)               | static hosting deploy for VK Mini Apps, drop-in for `vk-miniapps-deploy`  |
| [`bridge-schema`](/en/bridge-schema/) | the VK Bridge event catalogue as data + TypeScript types                  |
| [`api-schema`](/en/api-schema/)       | types and zod/valibot schemas for the whole VK API                        |

## Manual install

The scaffolder is optional. The bridge into an existing project:

```sh
npm install @vkma.dev/bridge
```

```ts
import bridge from "@vkma.dev/bridge";

await bridge.send("VKWebAppInit");
const user = await bridge.send("VKWebAppGetUserInfo");
```

Devtools on top (Vite):

```sh
npm install -D @vkma.dev/devtools @vkma.dev/bridge devframe @devframes/vite
```

```ts
// vite.config.ts
import { vkmaDevtools } from "@vkma.dev/devtools";

export default {
    plugins: [vkmaDevtools()],
};
```

Deploy:

```sh
npm install -D @vkma.dev/deploy
npx vkma-deploy init
npx vkma-deploy login
npx vkma-deploy
```

## Next steps

- [bridge](/en/bridge/) — sending events and subscribing, timeouts, the tap
- [router](/en/router/) — URL-driven mini app navigation
- [devtools](/en/devtools/) — the developer panel on your dev server
- [deploy](/en/deploy/) — building and publishing to VK hosting
