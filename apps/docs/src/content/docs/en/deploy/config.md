---
title: "Configuration"
description: "vkma-deploy.config.ts fields, file discovery, the legacy vk-hosting-config.json."
sidebar:
    order: 2
---

## File discovery

Discovery walks up from the current directory; at each level the first file found wins — the closest file beats file type. One file is the whole truth; there is no merging between config files.

1. `vkma-deploy.config.{ts,mts,js,mjs,json}` (preferred)
2. `vk-hosting-config.json` (legacy format, [below](#legacy-vk-hosting-configjson))

`--config <path>` points at an explicit file, skipping discovery (the `init` command does not support it).

TypeScript configs work with zero extra dependencies — native type stripping, Node >= 22.18:

```ts
// vkma-deploy.config.ts
import { defineDeployConfig } from "@vkma.dev/deploy";

export default defineDeployConfig({
    appId: 42,
    staticPath: "./build",
    endpoints: { mobile: "index.html", web: "index.html" },
    environment: "both",
});
```

JSON configs get editor autocomplete via `$schema`:

```jsonc
{
    "$schema": "https://unpkg.com/@vkma.dev/deploy/schema/vkma-deploy.config.schema.json",
    "appId": 42,
    "staticPath": "./build",
}
```

## Fields

| Field             | Type                                    | Default                                       | What it does                                                                       |
| ----------------- | --------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------- |
| `appId`           | integer >= 1                            | — (required)                                  | Mini app ID; or `VKMA_APP_ID` / `MINI_APPS_APP_ID`                                 |
| `staticPath`      | string                                  | — (without `bundle`)                          | Build directory that gets zipped and uploaded, e.g. `"./build"`                    |
| `bundle`          | string                                  | —                                             | A prebuilt `.zip`; skips zipping, mutually exclusive with `staticPath`             |
| `endpoints`       | `{ mobile?, mvk?, web? }`, at least one | — (required)                                  | Entry files per platform; only configured ones are checked and sent                |
| `environment`     | `"dev"` \| `"production"` \| `"both"`   | `"both"`                                      | Target environment                                                                 |
| `updateProd`      | boolean                                 | — (see [the CLI](/en/deploy/cli/#url-policy)) | Switch production URLs; independent of `updateDev`                                 |
| `updateDev`       | boolean                                 | —                                             | Switch dev URLs; same unset rules                                                  |
| `testGroupName`   | string                                  | —                                             | Deploy into a named test group (dev only)                                          |
| `accessToken`     | string                                  | —                                             | Token; prefer an env var or `vkma-deploy login` over committing                    |
| `proxy`           | string (`http(s)://…`)                  | —                                             | HTTP(S) proxy for all CLI traffic; details in [Env and CI](/en/deploy/env-and-ci/) |
| `apiHost`         | string                                  | `"https://api.vk.ru/method/"`                 | VK API base URL                                                                    |
| `oauthHost`       | string                                  | `"https://oauth.vk.ru/"`                      | OAuth base URL                                                                     |
| `apiVersion`      | string                                  | `"5.199"`                                     | VK API version                                                                     |
| `oauthClientId`   | integer                                 | `6670517`                                     | OAuth client for the device flow                                                   |
| `queueTimeoutSec` | integer                                 | `600`                                         | Hosting queue deadline, seconds                                                    |

An `endpoints` block with no platform is a config error: VK never processes a task without `endpoint_*` params — the queue stays silent forever. A missing entry file for a configured platform is caught in preflight.

## Validation

The new format is strict: an unknown or misspelled field fails validation naming the key instead of silently deploying defaults (the classic — `static_path` inside a `vkma-deploy.config.*`). `$schema` is whitelisted in JSON files for autocomplete; TS configs get their types from `defineDeployConfig` and never carry `$schema`.

## Legacy vk-hosting-config.json

The legacy file is mapped automatically; every unrecognized or unsupported field produces a warning — nothing is dropped silently.

| Legacy field      | Maps to         | Note                                   |
| ----------------- | --------------- | -------------------------------------- |
| `app_id`          | `appId`         |                                        |
| `static_path`     | `staticPath`    |                                        |
| `endpoints`       | `endpoints`     |                                        |
| `access_token`    | `accessToken`   |                                        |
| `bundleFile`      | `bundle`        |                                        |
| `update_prod`     | `updateProd`    | `0`/`1`/boolean                        |
| `update_dev`      | `updateDev`     |                                        |
| `test_group_name` | `testGroupName` |                                        |
| `api_host`        | `apiHost`       |                                        |
| `oauth_host`      | `oauthHost`     |                                        |
| `noprompt`        | —               | Ignored; the equivalent is `--yes`     |
| `debug`           | —               | Ignored; the equivalent is `--verbose` |
| `proxy_url`       | —               | Unsupported; use `proxy`               |
| `expires_in`      | —               | Ignored                                |

## Precedence and inspection

Application order: CLI flags > env vars > config > defaults. To see what a deploy will actually use: `vkma-deploy config` prints the resolved config with each value's source and all warnings; `accessToken` stays hidden in the output.
