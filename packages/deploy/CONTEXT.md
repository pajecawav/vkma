# Domain glossary — packages/deploy

Terms that carry precise meaning in this package. When naming modules,
functions, or errors, use these words; when a conversation sharpens one
of them, update it here (English only, per AGENTS.md).

## Resolution vs deploy readiness

Two distinct contracts over the same config:

- **Resolution** (`resolveConfig`) — discovery, legacy mapping, env
  aliases, merge order (flag > env > config > default), and config
  sanity that applies to _every_ consumer (`appId` present, test group
  only in dev). Login and `config` use resolution alone.
- **Deploy readiness** (`assertDeployReadiness`) — the deployable-bundle
  contract: exactly one of `staticPath`/`bundle`, at least one endpoint
  platform (VK ignores tasks without `endpoint_*` params). Enforced at
  the mouth of the deploy flow (`deployResolved`), never during
  resolution.

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

## Related vocabulary

See the architecture review vocabulary (module, interface, depth, seam,
adapter, leverage, locality) in the shared `codebase-design` skill; the
wire-compatibility surface (event codes 200–206, `cli_version=2`,
multipart field `file`) is defined in `src/constants.ts` and recorded in
`AGENTS.md`.
