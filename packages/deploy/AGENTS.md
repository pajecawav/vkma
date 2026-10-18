# AGENTS.md — packages/deploy

Deploy tooling for VK Mini Apps hosting: a drop-in compatible successor to
`@vkontakte/vk-miniapps-deploy`, usable as a CLI (`vkma-deploy`) and as a
library (`deploy()`). Keep all comments, commits, and docs in English.

## Commands

- `pnpm build` — tsdown (ESM + dts, entries: `src/index.ts`, `src/cli.ts`)
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
6. **Runtime deps are exactly two**: `@sinclair/typebox` (schema +
   validation) and `fflate` (zip). Everything else is hand-rolled on
   Node stdlib. Adding a dependency requires an explicit user decision.
7. Node >= 22.18 (native TS stripping for config files); `engines` is
   meaningful, don't lower it silently.

## Upstream bugs this package fixes (regression-test them)

- infinite long-poll hang (upstream #119) → `queueTimeoutSec` deadline
- single-environment deploys terminating without server skip events
- missing `static_path` → zipped `./undefined`; missing _configured_
  endpoint file → preflight errors (unconfigured endpoints are valid:
  nothing is checked or sent, matching upstream)
- declining the confirmation-code prompt (empty answer/Ctrl+C) aborts with
  130; declining the test-group prompt proceeds without a group; prompted
  values must not clobber
  config
- token in query strings leaked into logs → masked everywhere
- fixed 1s retry → exponential backoff with jitter; VK error 6 retried

## Testing notes

- Mock the network with `createFetchSpy` (`src/test-utils.ts`); never hit
  the real VK API in tests.
- Beware await-loops with injected `instantSleep` and instant mock
  responses: they can starve timers and OOM the worker (we hit this once).
  Give hanging-path mocks a real `setTimeout` delay.
- Config-resolution tests use throwaway dirs under `/tmp/opencode`.
