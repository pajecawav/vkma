---
title: "Env and CI"
description: "VKMA_* and MINI_APPS_* variables, the token from a secret, proxies."
sidebar:
    order: 3
---

## Environment variables

| Variable                                          | What it sets                     |
| ------------------------------------------------- | -------------------------------- |
| `VKMA_ACCESS_TOKEN` (or `MINI_APPS_ACCESS_TOKEN`) | Access token                     |
| `VKMA_APP_ID` (or `MINI_APPS_APP_ID`)             | App ID                           |
| `VKMA_ENVIRONMENT` (or `MINI_APPS_ENVIRONMENT`)   | Target environment               |
| `VKMA_TEST_GROUP`                                 | Test group name                  |
| `VKMA_TIMEOUT`                                    | Queue deadline, seconds          |
| `CI_URLS`                                         | Print raw URL keys (legacy mode) |
| `NO_COLOR`                                        | Disable colors                   |

The `MINI_APPS_*` aliases are supported forever, not deprecated. The environment normalizes case-insensitively: `dev`/`development` → dev, `prod`/`production` → production, `both`/`all` → both. Precedence: CLI flags > env > [config](/en/deploy/config/) > defaults.

## The token

The token resolves in order: an env variable > the `accessToken` config field > credentials saved by `vkma-deploy login` (`$XDG_CONFIG_HOME/vkma/deploy/credentials.json`, mode `0600`) > a fallback read from the token saved by the official `@vkontakte/vk-miniapps-deploy`. The token is masked in every output: logs, errors and `--verbose`, query strings included. In CI keep it in the runner's secrets and pass it via the environment, not the config.

## CI

The CLI is non-interactive and CI-safe by default: prompts are disabled with the `CI` env var, non-TTY stdin, and the `--json`/`--quiet` modes. Keep the token in the runner's secrets:

```yaml
- run: pnpm build
- run: npx vkma-deploy --update-prod --no-update-dev
  env:
      VKMA_ACCESS_TOKEN: ${{ secrets.VK_TOKEN }}
```

What to account for in CI:

- **The URL policy is mandatory.** A non-interactive run without explicit `--update-prod`/`--no-update-prod` and `--update-dev`/`--no-update-dev` (or the `updateProd`/`updateDev` config fields) fails with `E_UPDATE_FLAG_REQUIRED`, exit `1`. Pin the policy once, via flags or in the config.
- **`--json`** — deploy events line by line (NDJSON) on stdout for parsing; the logger writes to stderr.
- **`vkma-deploy config`** — a cheap fail-fast step: prints the resolved config and fails on a validation error before any archive is built.
- **`--verbose`** — debugging failed runs: HTTP requests are dumped to the log with secrets masked.
- **`--dry-run`** — validate the config and build the archive without a single network request; handy as a smoke step after the build.
- **The VK confirmation code** (queue event 205) cannot be answered in CI. The run fails fast instead of hanging on a prompt. Supply the code programmatically via the library API: `deploy({ confirmCode: async () => "123456" })`.
- **No `logout` needed in CI**: credentials only live where you ran `login`.

## Proxies

All CLI traffic (VK API, archive upload, OAuth) can be routed through an HTTP(S) proxy. Three sources, first match wins:

1. the `--proxy http://proxy.corp:8080` flag;
2. the `HTTP_PROXY` / `HTTPS_PROXY` environment variables (lowercase variants work too and win when both are set, matching Node);
3. the `proxy` field in the [config](/en/deploy/config/).

`NO_PROXY` from the environment is always honored. Both `http://` and `https://` proxy URLs are accepted (credentials in the URL are masked in output); socks is not. Requires Node >= 22.21 / 24 (native env-proxy support); older runtimes warn and continue directly. Only the CLI activates the proxy. Library consumers route traffic themselves via `fetchImpl`.

## Next

- [CLI](/en/deploy/cli/) — commands, flags, exit codes.
- [Configuration](/en/deploy/config/) — every config field.
