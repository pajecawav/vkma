# @vkma.dev/deploy

Deploy CLI and library for [VK Mini Apps](https://dev.vk.com/en/mini-apps) hosting — a modern, drop-in compatible successor to `@vkontakte/vk-miniapps-deploy`.

```sh
pnpm dlx @vkma.dev/deploy   # or: npx
vkma-deploy                 # deploys using the config in your project
```

## Why

The official tool works, but it has sharp edges: an infinite deploy queue hang
([#119](https://github.com/VKCOM/vk-miniapps-deploy/issues/119)), prompts that
clobber config values and exit `0` when declined, tokens printed into logs,
zero tests, no library API. `@vkma.dev/deploy` keeps the wire protocol 100 %
compatible while fixing all of the above.

**Drop-in compatibility** — your existing setup keeps working:

- reads `vk-hosting-config.json` (legacy upstream format) as a fallback
- reads `MINI_APPS_ACCESS_TOKEN`, `MINI_APPS_APP_ID`, `MINI_APPS_ENVIRONMENT`,
  `CI_URLS` env vars (forever, not deprecated)
- reuses the token stored by upstream in its configstore vault
- API version defaults to `5.199` (set `apiVersion: "5.131"` for byte-exact
  upstream parity)

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
2. `vk-hosting-config.json` — legacy upstream format (snake_case, mapped
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

| Field             | Type                          | Default                     | Notes                                                      |
| ----------------- | ----------------------------- | --------------------------- | ---------------------------------------------------------- |
| `appId`           | integer                       | — (required)                | Or `VKMA_APP_ID` / `MINI_APPS_APP_ID`                      |
| `staticPath`      | string                        | — (required w/o bundle)     | Directory to zip, e.g. `"./build"` (legacy: `static_path`) |
| `bundle`          | string                        | —                           | Prebuilt `.zip`; skips zipping (legacy: `bundleFile`)      |
| `endpoints`       | `{mobile?, mvk?, web?}`       | all `"index.html"`          | Entry files per platform                                   |
| `environment`     | `"dev"\|"production"\|"both"` | `"both"`                    | What to deploy (legacy env var values work too)            |
| `updateProd`      | boolean                       | `true`                      | Switch production URLs (independent — fixes upstream #118) |
| `updateDev`       | boolean                       | `true`                      | Switch dev URLs                                            |
| `testGroupName`   | string                        | —                           | Deploy into a named test group (dev only)                  |
| `accessToken`     | string                        | —                           | Prefer env var or `vkma-deploy login` over committing      |
| `apiHost`         | string                        | `https://api.vk.ru/method/` |                                                            |
| `oauthHost`       | string                        | `https://oauth.vk.ru/`      |                                                            |
| `apiVersion`      | string                        | `"5.199"`                   | Use `"5.131"` for exact upstream parity                    |
| `queueTimeoutSec` | integer                       | `600`                       | Hosting queue deadline (fixes the upstream infinite hang)  |

Unknown legacy fields and unsupported ones (`proxy_url`, `debug`, `noprompt`)
produce warnings, never silent drops.

### Environment variables

| Variable                                          | Purpose                              |
| ------------------------------------------------- | ------------------------------------ |
| `VKMA_ACCESS_TOKEN` (or `MINI_APPS_ACCESS_TOKEN`) | Access token                         |
| `VKMA_APP_ID` (or `MINI_APPS_APP_ID`)             | App ID override                      |
| `VKMA_ENVIRONMENT` (or `MINI_APPS_ENVIRONMENT`)   | Target environment                   |
| `VKMA_TEST_GROUP`                                 | Test group override                  |
| `VKMA_TIMEOUT`                                    | Queue timeout (seconds)              |
| `CI_URLS`                                         | Print raw URL keys (upstream compat) |
| `NO_COLOR`                                        | Disable colors                       |

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
`--update-dev/--no-update-dev`, `--dry-run`, `--interactive`, `--json`,
`--verbose/-v`, `--quiet/-q`, `--no-color`, `--help/-h`, `--version/-V`.

Exit codes: `0` success · `1` config/user error · `2` network/timeout ·
`3` VK API error · `130` aborted (Ctrl+C).

### Interactivity

By default the CLI never prompts — it is CI-safe. With `--interactive` (and a
TTY) it prompts **only** for values that are not already set (flag > env >
config > prompt), and prompted values are used for the current run only —
nothing is written back into your config. Declining a prompt cancels with
exit code `130`, never a fake success.

The one unconditional prompt is the confirmation code VK sends for some
deploys (queue event 205): in a terminal you will be asked to enter it; in CI
provide it programmatically via the library API.

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

Granular building blocks are exported too: `resolveConfig`, `loginDeviceFlow`,
`zipDirectory`, `uploadBundle`, `waitForQueue`, `callApi`,
`loadCredentials`/`saveCredentials`/`clearCredentials`, `createRedactor`.

## Credentials

`vkma-deploy login` runs the OAuth device flow (opens the browser, polls
until you approve) and stores the token at
`$XDG_CONFIG_HOME/vkma/deploy/credentials.json` with mode `0600`. The token
is never printed. On first run the store also reads the upstream vault
(`~/.config/configstore/@vkontakte/vk-miniapps-deploy.json`) so migrating
requires no re-login.

## Differences from upstream

- Queue polling has a hard deadline (default 10 min) instead of hanging
  forever; single-environment deploys terminate on their own URL event.
- Missing `staticPath`/`endpoints`/files fail in preflight with actionable
  messages instead of zipping `./undefined` or throwing `TypeError`.
- Retries use exponential backoff with jitter; VK error 6 is retried.
- The access token is masked in every log line and error, in every mode.
- `updateProd`/`updateDev` are independent booleans (upstream could not
  update only production URLs — issue #118).
- Declining a prompt exits `130`, not `0`.
- No `postinstall` noise, no unused dependencies, ESM-only, 2 runtime deps
  (`@sinclair/typebox`, `fflate`).
- Proxy support (`proxy_url`) is not implemented yet; set
  `NODE_USE_ENV_PROXY=1` on Node 24+ as a workaround.

## License

MIT
