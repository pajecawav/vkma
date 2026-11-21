# AGENTS.md — packages/tunnel

Public HTTPS tunnels for local VK Mini App servers: CLI (`vkma-tunnel`),
Node API (`createTunnel`), Vite plugin (`@vkma.dev/tunnel/vite`). Provider:
opentunnel (blind TLS tunnels, no accounts, server-assigned hostnames).
Keep all comments, commits, and docs in English.

## Commands

- `pnpm build` — tsdown (ESM-only, **unbundled**: dist mirrors src 1:1;
  entries: `src/index.ts`, `src/vite.ts`, `src/cli.ts`)
- `pnpm test` — vitest (co-located `*.test.ts`); no network — the
  opentunnel SDK is only exercised through its Storage adapter against
  temp dirs
- `pnpm schema` — regenerate `schema/vkma-tunnel.config.schema.json` after
  changing `src/config/schema.ts` (a test fails if they drift)
- `node dist/cli.js --help` — smoke-test the binary

## Architecture map

- `src/config/` — TypeBox schema (doubles as JSON Schema), walk-up
  discovery, TS loading via native `module.stripTypeScriptTypes`
  (write-to-temp-sibling trick; the `emitWarning` shim is the single
  documented exception to the "library never touches process" invariant,
  same as deploy).
- `src/core/` — provider-neutral surface: `types.ts` (TunnelHandle,
  TunnelProvider, event union), `tunnel.ts` (`createTunnel`: defaults +
  validation + provider dispatch), `profile.ts` (default profile =
  project dir basename, sanitized), `identity.ts` (record files under the
  data dir; shared read/remove surface for the CLI).
- `src/providers/opentunnel.ts` — the only provider + the
  `OpenTunnelStorage` adapter over our record files (NOT the SDK's XDG
  store: our format, shared metadata beside the identity).
- `src/proxy.ts` — the loopback host-rewriting forward proxy (same-length
  `*.localhost` alias: pure byte substitution, WS upgrades pass through).
- `src/cli/` — argv parser, `logger.ts` (pretty/json/quiet renderers,
  elapsed-time spinner — adapted from deploy's CliLogger), `main.ts`
  (dispatch/rendering; returns exit codes, never calls `process.exit`),
  `qr.ts`, `opener.ts`. `src/cli.ts` is the shebang entry wiring
  SIGINT/SIGTERM.
- `src/vite.ts` — the plugin (dev + preview), `allowedHosts` management.

## Invariants — do not break

1. **Stable URL by default.** Identity persists per profile in
   `$XDG_DATA_HOME/vkma/tunnel/<profile>.json` (0600, atomic writes).
   `reset` is the only rotation path. Provider records must keep the
   shared fields (`hostname`, `lastTarget`, `lastRoute`, `createdAt`,
   `updatedAt`) — the CLI list/status read them provider-neutrally.
2. **Layering is fixed**: CLI flags / plugin options > config file >
   auto-detected server values (plugin) > defaults. No env layer by
   design; `OPENTUNNEL_API` is read natively by the SDK, don't shadow it.
3. **The library never touches `process`** outside injected `env`
   (identity store default param, `resolveTunnelConfig` cwd default) and
   the documented `stripTypeScriptTypes` warning shim. Only `src/cli*`
   and `src/vite.ts` (console logging, browser opener) may.
4. **A fatal tunnel never kills the dev server** (plugin prints a red
   line, devtools policy). The CLI maps failures to exit codes:
   0 ok · 1 config/user · 2 network · 130 aborted — via `TunnelError.kind`.
5. **Never trust SDK teardown to settle.** The opentunnel promise wrapper
   can leave `closed`/`close()` unresolved when a bridge half-dies (idle
   timeout into a route-conflict retry loop). The CLI therefore bounds
   every exit-path await: abort grace 3 s, close cap 3 s, plus an unref'd
   force-exit timer in `src/cli.ts`. SIGTERM gets the same graceful path
   as SIGINT — a hard kill skips the bridge close and the server keeps
   the route bound to a ghost session, which is exactly the
   `route_conflict` takeover storm the next run must fight through.
6. **The Vite plugin must add the tunnel hostname to
   `server.allowedHosts`/`preview.allowedHosts`** before the URL is
   usable — Vite >= 5.4.12 answers foreign Host headers with 403.
   The core additionally routes through the host-rewriting proxy
   (`hostRewrite`, default on): a same-length `*.localhost` alias keeps
   the byte substitution trivial and covers the CLI, which cannot touch
   the user's vite config. Auto-detect the real listening port (port
   0/strict ports), don't trust the configured one blindly. Default the
   forward target to `localhost` — vite preview on modern Node binds
   IPv6 loopback only.
7. **Provider registry is closed** (v0.1: `opentunnel` only). The
   `TunnelProvider` type is public; adding a provider is a package
   release, not a runtime plugin API.
8. Node >= 22.18 (native TS stripping for config files); `engines` is
   meaningful, don't lower it silently.

## Testing notes

- Tests use throwaway dirs (`fs.mkdtemp` next to the test file); never
  touch the real XDG store.
- The `status` probe test spins a real loopback `http.Server` — no
  network beyond 127.0.0.1.
- Never hit the real opentunnel API in tests; a live CLI check is a
  manual step (`node dist/cli.js` with a local server on 5173).
- Shutdown resilience tests inject a `createTunnel` fake whose
  `closed`/`close()` never settle — the CLI must still exit (abort grace
  path), proving the exit never depends on third-party teardown.

## Known service behavior (not our bugs)

- **Bridge idle timeout → route-conflict loop**: when the network path
  half-dies, the client's idle watchdog tears the bridge down, but the
  close frame cannot be delivered, so the server keeps the route bound
  to the ghost session. Reconnects hit `route_conflict` until the server
  reaps it; the SDK retries and takes the route over. Rendered as
  `route held by another bridge (@), taking over…` — wait it out. The
  provider's self-probe (`keepAlive`, default on) prevents the
  traffic-idle variant of this; it cannot conjure missing pongs on a
  dead path.
- **First certificate issuance** takes minutes on the hosted service;
  progress lines (`waiting-certificate…`) exist precisely for that.
