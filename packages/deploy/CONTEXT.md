# Domain glossary — packages/deploy

Terms that carry precise meaning in this package. When naming modules,
functions, or errors, use these words; when a conversation sharpens one
of them, update it here (English only, per AGENTS.md).

## Resolution vs deploy readiness

Two distinct contracts over the same config:

- **Resolution** (`resolveConfig`) — discovery, legacy mapping, env
  aliases, merge order (flag > env > config > default), and config
  sanity that applies to _every_ consumer (test group only in dev).
  Login and `config` use resolution alone.
- **Deploy readiness** (`assertDeployReadiness`) — the operation
  contract for deploy: `appId` present (which app), exactly one of
  `staticPath`/`bundle` (what to ship), and at least one endpoint
  platform (VK ignores tasks without `endpoint_*` params). Enforced at
  the mouth of the deploy flow (`deployResolved`), never during
  resolution. `login` demands `appId` on its own terms — an interactive
  prompt under `--interactive`, otherwise login-specific guidance.

## Retry budget

One operation = one attempt budget (`maxAttempts`, default 3). The
budget is owned by `runWithRetry` in `src/api/retry.ts` and covers
transport failures, retriable HTTP statuses, and VK error 6 together.
Retry loops never nest: `httpOnce` is single-shot, and every caller
composes through the same module with one backoff formula
(`base * 2^(attempt-1) + jitter(0..250)`).

## Redaction boundary

Everything printed or thrown crosses the redactor — `details`/`data`
structurally, and **messages through `redactString`** at the logger seam
(`emit()`/`fail()`). Raw server payloads (VK `error` objects, OAuth
responses) live in `details`, never inside message templates. The single
deliberate exemption is `rawOut`: the OAuth confirm URL, whose one-time
`code=` parameter the user must see unmasked.

## Status reports (OSC 7501)

A `report` is one escape sequence; a `record` is what the terminal keeps.
The pure builder (`statusSequence`) turns a `StatusRecord` into the wire
bytes; the CLI's `StatusReporter` owns when one goes out (TTY-only, no
`--json`, `--no-status`/`VKMA_NO_STATUS` opt-out) and remembers the last
`working` record so a prompt can `resume()`. Aborted runs map to `idle`,
other failures to `error`, success to `done` — records survive process
exit; `working`/`blocked` do not.

## Proxy routing

CLI-only transport concern: one effective HTTP(S) proxy URL resolved with
the package layering (`--proxy` flag > `HTTP(S)_PROXY` env > `proxy` config
field) and activated through Node's native `http.setGlobalProxyFromEnv`
before the first network call. `NO_PROXY` passes through from the
environment. Credentials embedded in the proxy URL are masked in output and
registered with the redactor. The library treats `config.proxy` as inert
data — its seam for transport control is `fetchImpl`.

## Update-flag triage

`updateProd`/`updateDev` are tri-state through resolution: **set** (config
file, legacy snake_case, or CLI flag), **confirmed** (a TTY answer,
recorded as the `"prompt"` source so it reaches the wire params), or
**unset**. Unset values are a CLI deploy-time concern, not a resolution
one: a TTY run asks, `--yes`/`--dry-run` keep the VK server default
(upstream `noprompt` parity), and any other non-interactive run fails with
`E_UPDATE_FLAG_REQUIRED` — the server default never decides URL switching
silently. The library itself never prompts and treats unset exactly as
upstream did: the param is simply not sent.

## Related vocabulary

See the architecture review vocabulary (module, interface, depth, seam,
adapter, leverage, locality) in the shared `codebase-design` skill; the
wire-compatibility surface (event codes 200–206, `cli_version=2`,
multipart field `file`) is defined in `src/constants.ts` and recorded in
`AGENTS.md`.
