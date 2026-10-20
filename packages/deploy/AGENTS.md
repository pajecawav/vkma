# AGENTS.md — packages/deploy

Deploy tooling for VK Mini Apps hosting: a drop-in compatible successor to
`@vkontakte/vk-miniapps-deploy`, usable as a CLI (`vkma-deploy`) and as a
library (`deploy()`). Keep all comments, commits, and docs in English.

## Commands

- `pnpm build` — tsdown (ESM-only, **unbundled**: dist mirrors src 1:1,
  with `.d.ts.map`/`.js.map` back to `src/`; `src/` ships in the tarball
  so IDE go-to-source lands on real sources, entries: `src/index.ts`,
  `src/cli.ts`)
- `pnpm test` — vitest (co-located `*.test.ts`)
- `pnpm schema` — regenerate `schema/vkma-deploy.config.schema.json` after
  changing `src/config/schema.ts` (a test fails if they drift)
- `node dist/cli.js --help` — smoke-test the binary

## Architecture map

- `src/config/` — TypeBox schema (doubles as JSON Schema), legacy
  `vk-hosting-config.json` mapping, env aliases (`VKMA_*` +
  `MINI_APPS_*`), walk-up discovery, TS loading via native
  `module.stripTypeScriptTypes` (write-to-temp-sibling trick for relative
  imports).
- `src/credentials/` — XDG credentials store (0600) with read-only fallback
  to the upstream configstore vault.
- `src/api/` — `client.ts` (retry/backoff/jitter, HTML detection, VK error
  mapping, token masking), `oauth.ts` (device flow), `upload.ts`
  (multipart with byte-level progress).
- `src/deploy/` — `queue.ts` (long-poll with hard deadline), `flow.ts`
  (orchestration emitting the `DeployEvent` stream).
- `src/cli/` — argv parser, prompts (TTY-only), completions, `main.ts`
  (dispatch/rendering; returns exit codes, never calls `process.exit`).
  `src/cli.ts` is the shebang entry that wires SIGINT.
- `src/logger/` — pretty/json/quiet renderers over one `LogRecord` pipeline.

## Invariants — do not break

1. **Wire compatibility.** Param names, event codes (200–206), URL keys,
   `cli_version=2`, multipart field `file`, base64 `upload_response` mirror
   upstream 1.0.3. See `src/constants.ts` for the exact values.
2. **The library never touches `process`** (no exit, no stdin, no env reads
   outside injected `env`, no spawning — the OAuth browser opener is an
   injected callback, supplied only by the CLI and only on a TTY; the
   `stripTypeScriptTypes` emitWarning shim in `load.ts` is the single
   documented exception, scoped and restored synchronously).
   Only `src/cli*` may.
3. **Secrets never leak.** Everything printed or thrown goes through the
   redactor; the login command never prints the token itself.
4. **Stable exit codes**: 0 ok · 1 config/user · 2 network/timeout ·
   3 VK API · 130 aborted. Mapped via `DeployError.kind`.
5. **Prompts are opt-in** (`--interactive`, TTY only) and fill only values
   that are not already set (precedence: flag > env > config > prompt).
   Two exceptions, both TTY-only and auto-skipped for `--yes`/`--dry-run`,
   the `CI` env var, and `--json`/`--quiet` modes: the event-205
   confirmation code and the pre-deploy confirmation.
6. **Runtime deps are exactly two**: `@sinclair/typebox` (schema +
   validation) and `fflate` (zip). Everything else is hand-rolled on
   Node stdlib. Adding a dependency requires an explicit user decision.
7. Node >= 22.18 (native TS stripping for config files); `engines` is
   meaningful, don't lower it silently.

## Upstream reference (@vkontakte/vk-miniapps-deploy 1.0.3)

The npm tarball (`npm pack @vkontakte/vk-miniapps-deploy@1.0.3`) is the
source of truth when in doubt. User-facing docs intentionally never
mention upstream internals — that knowledge lives here.

### Compatibility surface (public forever)

- Legacy `vk-hosting-config.json` (snake_case) plus `MINI_APPS_*` and
  `CI_URLS` env aliases; read-only fallback to the upstream configstore
  vault (`~/.config/configstore/@vkontakte/vk-miniapps-deploy.json`) so
  migrating users need no re-login.
- `apiVersion` defaults to `5.199`; `"5.131"` is the exact upstream pin.
  Both deliver queue events identically (verified live) — the difference
  is cosmetic, kept only for byte-exact parity needs.
- Wire semantics mirrored exactly: `update_prod`/`update_dev` are sent
  only when explicitly configured (`'update_prod' in cfg` upstream
  semantics, tracked via `meta.sources`); unconfigured endpoint platforms
  are neither preflight-checked nor sent as `endpoint_*` params.
- Proxy support: the CLI routes through `--proxy` flag /
  `HTTP(S)_PROXY` env / `proxy` config field via Node's native
  `http.setGlobalProxyFromEnv` (Node >= 22.21 / 24; older runtimes warn and
  continue). The legacy upstream `proxy_url` field stays unsupported
  (deliberate); the library never routes — consumers inject `fetchImpl`.

### Fixed bugs & intentional differences (regression-test them)

- infinite long-poll hang (upstream #119) → `queueTimeoutSec` deadline;
  single-environment deploys terminate on their own URL event
- missing `static_path` → zipped `./undefined`; missing _configured_
  endpoint file → preflight errors; an empty `endpoints` block is a
  config error — VK never processes tasks without `endpoint_*` params
  (live-verified: the queue stays silent forever), so at least one
  platform is required
- `updateProd`/`updateDev` are independent booleans (upstream #118:
  production-only URL updates were impossible)
- declining the confirmation-code prompt (empty answer/Ctrl+C) aborts with
  130; declining the test-group prompt proceeds without a group; prompted
  values must not clobber config
- token in query strings leaked into logs → masked everywhere, every mode
- fixed 1s retry → exponential backoff with jitter; VK error 6 retried
- no `postinstall` noise, ESM-only, 2 runtime deps

## Testing notes

- Mock the network with `createFetchSpy` (`src/test-utils.ts`); never hit
  the real VK API in tests.
- Beware await-loops with injected `instantSleep` and instant mock
  responses: they can starve timers and OOM the worker (we hit this once).
  Give hanging-path mocks a real `setTimeout` delay.
- Tests create throwaway dirs via `makeTempDir` (`src/test-utils.ts`)
  under the OS temp dir — never hardcode machine-specific scratch paths.
