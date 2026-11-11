---
title: deploy
description: "Deploy VK Mini Apps to VK hosting: a drop-in replacement for vk-miniapps-deploy."
sidebar:
    order: 0
    label: "Overview"
---

`@vkma.dev/deploy` is a deploy CLI and library for [VK Mini Apps](https://vk.ru/mini-apps) hosting, a drop-in compatible replacement for `@vkontakte/vk-miniapps-deploy`.

```sh
npx @vkma.dev/deploy        # or: pnpm dlx / yarn dlx / bunx
vkma-deploy                 # deploys using the config in your project
```

**Drop-in compatibility.** Your existing setup keeps working:

- reads `vk-hosting-config.json` (the legacy format) as a fallback
- reads the `MINI_APPS_ACCESS_TOKEN`, `MINI_APPS_APP_ID`, `MINI_APPS_ENVIRONMENT`, `CI_URLS` env vars (forever, not deprecated)
- reuses the token stored by the official tool, so migrating requires no re-login

## Quick start

```sh
npm install -D @vkma.dev/deploy
npx vkma-deploy init          # create vkma-deploy.config.ts (interactive)
npx vkma-deploy login         # one-time browser authorization
npx vkma-deploy --dry-run     # validate config + bundle without uploading
npx vkma-deploy               # deploy
```

`init` refuses to touch an existing config (pointing you at the file to edit instead), imports values from a legacy `vk-hosting-config.json` when one sits in the current directory (the token is never copied into the new file), and prompts only for what is still missing. In CI, pass the values as flags: `npx vkma-deploy init --app-id 42 --endpoints mobile,web`.

## Configuration

Discovery walks up from the current directory; at each level the first file found wins (closest file beats file type). One file is the whole truth, with no merging between config files.

1. `vkma-deploy.config.{ts,mts,js,mjs,json}` (preferred)
2. `vk-hosting-config.json` (legacy format, snake_case, mapped automatically with warnings for anything ignored)

TypeScript configs work with zero extra dependencies (native type stripping, Node >= 22.18):

```ts
// vkma-deploy.config.ts
import { defineDeployConfig } from "@vkma.dev/deploy";

export default defineDeployConfig({
    appId: 42,
    staticPath: "./build",
    environment: "both", // "dev" | "production" | "both"
});
```

JSON configs get editor autocomplete via `$schema`:

```jsonc
// vkma-deploy.config.json
{
    "$schema": "https://unpkg.com/@vkma.dev/deploy/schema/vkma-deploy.config.schema.json",
    "appId": 42,
    "staticPath": "./build",
}
```

## Next

- [CLI](/en/deploy/cli/) — commands, flags, prompts, exit codes.
- [Configuration](/en/deploy/config/) — every config field and the legacy format.
- [Env and CI](/en/deploy/env-and-ci/) — env vars, deploying in CI, proxies.

## Links

- [npm: @vkma.dev/deploy](https://www.npmjs.com/package/@vkma.dev/deploy)
