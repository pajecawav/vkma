# @vkma.dev/deploy

Deploy CLI and library for [VK Mini Apps](https://vk.ru/mini-apps) hosting — a modern, drop-in compatible successor to `@vkontakte/vk-miniapps-deploy`.

```sh
pnpm dlx @vkma.dev/deploy   # or: npx
vkma-deploy                 # deploys using the config in your project
```

**Drop-in compatibility** — your existing setup keeps working:

- reads `vk-hosting-config.json` (the legacy format) as a fallback
- reads `MINI_APPS_ACCESS_TOKEN`, `MINI_APPS_APP_ID`, `MINI_APPS_ENVIRONMENT`,
  `CI_URLS` env vars (forever, not deprecated)
- reuses the token stored by the official tool, so migrating requires no
  re-login

## Quick start

```sh
npm add -D @vkma.dev/deploy
npx vkma-deploy login        # one-time browser authorization
npx vkma-deploy --dry-run    # validate config + bundle without uploading
npx vkma-deploy              # deploy
```

## Configuration

Discovery walks up from the current directory; at each level the first file
found wins (closest file beats file type). One file is the whole truth —
there is no merging between config files.

1. `vkma-deploy.config.{ts,mts,js,mjs,json}` — preferred
2. `vk-hosting-config.json` — legacy format (snake_case, mapped
   automatically with warnings for anything ignored)

TypeScript configs work with zero extra dependencies (native type stripping,
Node >= 22.18):

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

### Fields

| Field             | Type                                 | Default                     | Notes                                                                                                                    |
| ----------------- | ------------------------------------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `appId`           | integer                              | — (required)                | Or `VKMA_APP_ID` / `MINI_APPS_APP_ID`                                                                                    |
| `staticPath`      | string                               | — (required w/o bundle)     | Directory to zip, e.g. `"./build"` (legacy: `static_path`)                                                               |
| `bundle`          | string                               | —                           | Prebuilt `.zip`; skips zipping (legacy: `bundleFile`)                                                                    |
| `endpoints`       | `{mobile?, mvk?, web?}`, ≥1 required | — (required)                | Entry files per platform; only configured ones are checked & sent. VK never processes a task with no `endpoint_*` params |
| `environment`     | `"dev"\|"production"\|"both"`        | `"both"`                    | What to deploy (legacy env var values work too)                                                                          |
| `updateProd`      | boolean                              | `true`                      | Switch production URLs (independent of `updateDev`)                                                                      |
| `updateDev`       | boolean                              | `true`                      | Switch dev URLs                                                                                                          |
| `testGroupName`   | string                               | —                           | Deploy into a named test group (dev only)                                                                                |
| `accessToken`     | string                               | —                           | Prefer env var or `vkma-deploy login` over committing                                                                    |
| `apiHost`         | string                               | `https://api.vk.ru/method/` |                                                                                                                          |
| `oauthHost`       | string                               | `https://oauth.vk.ru/`      |                                                                                                                          |
| `apiVersion`      | string                               | `"5.199"`                   |                                                                                                                          |
| `queueTimeoutSec` | integer                              | `600`                       | Hosting queue deadline                                                                                                   |

Unknown legacy fields and unsupported ones (`proxy_url`, `debug`, `noprompt`)
produce warnings, never silent drops. New-format configs are strict: an
unknown or misspelled field (e.g. `static_path` in a `vkma-deploy.config.*`)
fails validation naming the key instead of silently deploying defaults.
`$schema` is whitelisted in JSON files for editor autocomplete; TS configs
get their types from `defineDeployConfig` and never carry `$schema`.

### Environment variables

| Variable                                          | Purpose                            |
| ------------------------------------------------- | ---------------------------------- |
| `VKMA_ACCESS_TOKEN` (or `MINI_APPS_ACCESS_TOKEN`) | Access token                       |
| `VKMA_APP_ID` (or `MINI_APPS_APP_ID`)             | App ID override                    |
| `VKMA_ENVIRONMENT` (or `MINI_APPS_ENVIRONMENT`)   | Target environment                 |
| `VKMA_TEST_GROUP`                                 | Test group override                |
| `VKMA_TIMEOUT`                                    | Queue timeout (seconds)            |
| `CI_URLS`                                         | Print raw URL keys (legacy compat) |
| `NO_COLOR`                                        | Disable colors                     |

Precedence: CLI flags > env vars > config file > defaults.

## CLI reference

```
vkma-deploy [deploy] [flags]     Deploy the app (default command)
vkma-deploy login                Authorize via browser, store the token
vkma-deploy logout               Remove stored credentials
vkma-deploy config               Print the resolved configuration
vkma-deploy completions <shell>  Print shell completion (bash|zsh|fish)
```

Flags: `--env <dev|production|both>`, `--config <path>`, `--timeout <sec>`,
`--test-group <name>`, `--update-prod/--no-update-prod`,
`--update-dev/--no-update-dev`, `--dry-run`, `--interactive`, `--yes/-y`,
`--json`, `--verbose/-v`, `--quiet/-q`, `--no-color`, `--help/-h`,
`--version/-V`.

Exit codes: `0` success · `1` config/user error · `2` network/timeout ·
`3` VK API error · `130` aborted (Ctrl+C).

### Interactivity

By default the CLI never prompts — it is CI-safe. With `--interactive` (and a
TTY) it prompts **only** for values that are not already set (flag > env >
config > prompt), and prompted values are used for the current run only —
nothing is written back into your config. Declining the optional test-group
prompt simply deploys without a group; canceling the confirmation-code
prompt (empty answer or Ctrl+C) aborts with exit code `130`, never a fake
success. Note that `--interactive` cannot rescue a config missing
`appId`/`staticPath` — resolution fails before any prompt with a
configuration error.

The one unconditional prompt is the confirmation code VK sends for some
deploys (queue event 205): in a terminal you will be asked to enter it; in CI
provide it programmatically via the library API.

Before a deploy, the CLI prints a deploy plan — target environments, URL
switching, test group, bundle, endpoints — and asks `Deploy? (Y/n)`.
`Enter` proceeds, `n` cancels with exit code `130` before anything leaves
the machine. The prompt is skipped (the plan is still logged) for `--yes`/`-y`,
`--dry-run`, the `CI` environment variable, non-TTY stdin, and
`--json`/`--quiet` modes.

### CI

```yaml
- run: pnpm build
- run: npx vkma-deploy
  env:
      VKMA_ACCESS_TOKEN: ${{ secrets.VK_TOKEN }}
```

Add `--json` for machine-readable, newline-delimited event records on stdout.

## Library API

```ts
import { deploy, defineDeployConfig, DeployError } from "@vkma.dev/deploy";

// Full flow with automatic config resolution:
const result = await deploy();

// Or pass a config directly (env vars still apply on top):
const result2 = await deploy({ appId: 42, staticPath: "./build" });

for (const [key, url] of Object.entries(result.urls.production ?? {})) {
    console.log(key, url);
}
```

`deploy()` accepts `undefined` (discover from cwd), a directory path, or a
config object. Options include `cwd`, `configPath`, `env`, `overrides`,
`dryRun`, `signal` (AbortSignal), `confirmCode` (event-205 provider),
`onEvent` (structured `DeployEvent` stream), and transport knobs
(`fetchImpl`, `sleep`, `maxAttempts`, `backoffBaseMs`).

The library never calls `process.exit` and never touches global state; all
failures are `DeployError`s with a `kind` (`config` | `user` | `network` |
`api` | `aborted`) and the matching exit code.

Granular building blocks are exported too: `resolveConfig`, `deployResolved`
(run the flow from an already-resolved config — what the CLI uses to avoid
resolving twice), `loginDeviceFlow`, `zipDirectory`, `uploadBundle`,
`waitForQueue`, `callApi`, `loadCredentials`/`saveCredentials`/
`clearCredentials`, `createRedactor`.

## Credentials

`vkma-deploy login` runs the OAuth device flow (opens the browser, polls
until you approve) and stores the token at
`$XDG_CONFIG_HOME/vkma/deploy/credentials.json` with mode `0600`. The token
is never printed. On first run the store also reads the token saved by the
official tool (`~/.config/configstore/@vkontakte/vk-miniapps-deploy.json`),
so migrating requires no re-login.

## Limitations

- Proxy support is not implemented yet; set `NODE_USE_ENV_PROXY=1` on
  Node 24+ as a workaround.

## License

MIT
