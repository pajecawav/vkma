# @vkma.dev/deploy

## 0.2.1

### Patch Changes

- 4c33b91: Keep a spinner running while the hosting backend processes the upload (the silent window between "Bundle uploaded" and the createGoHostingTask response); spinner phases now swap text on the live line instead of stacking timers.
- af7a226: Keep the upload speed visible between recomputations: it is now sticky (~every 300 ms window) instead of blinking away on frequent per-chunk frames, which the erase-line fix exposed.

## 0.2.0

### Minor Changes

- ccd1343: Require an explicit URL-switch policy: unset `--update-prod`/`--update-dev` are confirmed on a TTY and fail with `E_UPDATE_FLAG_REQUIRED` in non-interactive runs.

### Patch Changes

- ec8213b: fix(deploy): retry VK error 22 on createGoHostingTask (upstream #3 "invalid upload_response" flake)
- b2fd314: fix(deploy): align URL columns, bold the push-confirmation line, tighten the plan separator
- 814051e: Fix upload progress artifacts: erase each frame and shrink the bar to the terminal width so stale speed text never glues on and narrow terminals no longer show ghost frames.

## 0.1.1

### Patch Changes

- a443175: feat(deploy): HTTP(S) proxy support — the CLI routes all VK API, upload, and OAuth traffic through `--proxy <url>`, the standard `HTTP_PROXY`/`HTTPS_PROXY` environment variables, or a new `proxy` config field (first match wins, `NO_PROXY` honored). Uses Node's built-in env-proxy support (`http.setGlobalProxyFromEnv`, Node >= 22.21/24); older runtimes warn and continue directly. Credentials in the proxy URL are masked and redacted; socks and the legacy upstream `proxy_url` field are not supported.
- ae607b4: fix(deploy): the event-205 confirmation prompt now auto-skips for `--yes` and CI runs (AGENTS.md invariant #5) — a CI job with a pseudo-TTY (`docker run -t`) used to hang on readline forever; it now fails fast with the queue's explanatory user error. Sequential prompts (pre-deploy confirm, then the 205 code) share one readline interface per input stream, which also makes them work on non-TTY streams
- 8dd1c4f: fix(deploy): credential chain trust — an expired vkma token now falls through to the still-readable upstream configstore vault instead of reporting "no token"; `logout` warns when the upstream vault still holds a usable fallback token (the vault itself stays read-only by design); credential writes are atomic (temp file + rename, 0600 — a crash can no longer tear the store); the stripped TS-config temp sibling is written with mode 0600 so an inlined token never gets a world-readable copy
- 997ba67: fix(deploy): enforce the queue and login deadlines per request — `--timeout`/VKMA_TIMEOUT and the OAuth login timeout now cut in-flight polls via a composed abort signal instead of being checked only between polls (a hung server could previously outlive the budget until undici's ~300s default); the queue deadline also pauses while the event-205 confirmation prompt is open, so reading the code from your phone no longer burns the budget
- ad1b83e: fix(deploy): split deploy readiness from config resolution — `login` and `config` no longer demand `staticPath`/`endpoints` (first-run login on a fresh project used to fail with irrelevant errors); the checks now live in `assertDeployReadiness`, enforced by the deploy flow; `appId` is operation-level too: deploy demands it via readiness (with a config template hint when no config file was found), while `login` prompts for it under `--interactive` and otherwise fails with login-specific guidance
- f01db5c: fix(deploy): drain-safe binary exit — EPIPE on piped output (`--json | jq | head`) is now swallowed instead of crashing with an unhandled-rejection stack dump, the second Ctrl+C restores the terminal cursor before exiting 130, and an unexpected failure in the entry point surfaces as a one-line error with exit code 1
- 3fd9c45: fix(deploy): enforce redaction on log messages, not only on data — all messages now pass through the redactor in every output mode; raw OAuth server payloads moved from error messages into `details`; the login confirm URL moved out of the timeout message (surfaced via `onAuthUrl`/`rawOut` instead of being masked); `redact()` no longer flattens `Date` objects to `{}` and survives cyclic structures
- 383f677: fix(deploy): one retry budget per operation — `runWithRetry` now owns the loop, the exponential backoff with jitter, and abort checks for `callApi`, `httpGet`, and `uploadBundle`; previously the API call composed over the transport's own retry loop (up to maxAttempts² requests per call) and the backoff formulas had drifted (missing jitter on uploads, a magic +350ms on rate-limit retries)
- 9d62eac: fix(deploy): strict input parsing — `VKMA_TIMEOUT=1e3`/`--timeout 30s` are rejected instead of silently truncating to 1/30 seconds; `--config=` (empty value) is a parse error instead of silently falling back to discovery; whitespace-only `staticPath`/`bundle` count as unset (an empty staticPath used to resolve to cwd and zip the whole project); empty endpoint paths are rejected by the schema
- b29bc0e: fix(deploy): transport and zip hardening — fetch no longer follows redirects (a 3xx from a misconfigured or hostile endpoint must not forward the access token in the query string to another origin); user `onEvent` callback errors propagate as themselves instead of being retried as network failures; a UTF-8 BOM no longer defeats HTML detection and JSON parsing; body previews report real UTF-8 byte counts (Cyrillic error messages were off by 2-3x) and never cut surrogate pairs; zip archives are byte-deterministic (fixed 1980-01-01 UTC mtime — identical trees produce identical archives regardless of timezone); a local zip failure exits 1 (config) instead of 2 (network); the queue timeout message no longer leaks upstream internals; `$schema` no longer appears in `meta.sources`; upload retries no longer render negative speeds

## 0.1.0

### Minor Changes

- 0745fcf: Initial release: deploy CLI (`vkma-deploy`) and library for VK Mini Apps hosting, drop-in compatible with `@vkontakte/vk-miniapps-deploy`.

    - Config: `vkma-deploy.config.{ts,mts,js,mjs,json}` with `defineDeployConfig`, JSON Schema, legacy `vk-hosting-config.json` fallback, `VKMA_*` env vars with permanent `MINI_APPS_*` aliases
    - Protocol: upload server -> zip upload with byte progress -> hosting task -> queue long-poll with a hard deadline (fixes the upstream infinite hang)
    - Credentials: XDG store (0600) with `login`/`logout`, upstream configstore fallback
    - Logging: pretty TTY output, `--json` events, `--verbose`/`--quiet`, secret redaction in all modes
    - Library API: `deploy()`, `resolveConfig()`, granular steps, typed `DeployError`s, structured event stream
