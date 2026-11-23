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
  store: our format, shared metadata beside the identity). It also
  supervises the bridge (watchdog restarts; the SDK's own close on abort
  settles `closed`) and owns the merged event stream: a bounded tail
  until iterated, live afterwards, ended when the tunnel stops — never
  an unbounded queue, the CLI and the plugin never iterate it.
- `src/proxy.ts` — the loopback host-rewriting forward proxy (same-length
  `*.localhost` alias: pure byte substitution, WS upgrades pass through).
  A suffix that may still complete into the hostname is held back; the
  proxy releases it after a 50 ms idle window (`HOLD_FLUSH_MS`) — never
  remove that release, a request body or WS frame whose last byte is a
  hostname prefix would otherwise hang forever.
- `src/cli/` — argv parser, `logger.ts` (pretty/json/quiet renderers,
  elapsed-time spinner — adapted from deploy's CliLogger), `main.ts`
  (dispatch/rendering; returns exit codes, never calls `process.exit`),
  `qr.ts`, `opener.ts`. `src/cli.ts` is the shebang entry wiring
  SIGINT/SIGTERM.
- `src/vite.ts` — the plugin (dev + preview): the `config` hook that
  registers a stored hostname in `allowedHosts`, tunnel lifecycle,
  awaited close hooks, the keep-alive hold (the server's
  `keepAliveTimeout` goes to 2 min while a tunnel is live — ref-counted
  per httpServer because Vite restarts reuse it). `src/vite-exit.ts` (internal, not exported from
  `/vite`) holds the exit guard and the bounded close.

## Invariants — do not break

1. **Stable URL by default.** Identity persists per profile in
   `$XDG_DATA_HOME/vkma/tunnel/<profile>.json` (0600, atomic writes).
   `reset` is the only rotation path. Provider records must keep the
   shared fields (`hostname`, `lastTarget`, `lastRoute`, `pid`,
   `startedAt`, `createdAt`, `updatedAt`) — the CLI list/status read
   them provider-neutrally. `pid`/`startedAt` name the bridge HOLDER:
   the core stamps them only after a successful attach, never at start
   (a start-time stamp would overwrite the incumbent's pid before our
   first attempt, and the route-conflict hint would always find
   itself). The hint (`src/cli/conflict-hint.ts`, shared by CLI and
   plugin) tells a live holder ("stop it") from a dead one ("the
   service still holds its route").
2. **Layering is fixed**: CLI flags / plugin options > config file >
   defaults. The plugin always tunnels the Vite server it is attached
   to: its `port`/`host` options retarget it, the config-file keys do
   not (they belong to the CLI and the Node API). For the plugin the
   Vite root is the project — config discovery and the default profile
   start there, not at the launch directory. No env layer by design;
   `OPENTUNNEL_API` is read natively by the SDK, don't shadow it.
3. **The library never touches `process`** outside injected `env`
   (identity store default param, `resolveTunnelConfig` cwd default), the
   documented `stripTypeScriptTypes` warning shim, and `process.pid`
   (stamped into the profile record so route conflicts can point at the
   rival process — no side effects). Only `src/cli*` and `src/vite.ts`
   (console logging, browser opener) may.
4. **A fatal tunnel never kills the dev server** (plugin prints a red
   line, devtools policy). The CLI maps failures to exit codes:
   0 ok · 1 config/user · 2 network · 130 aborted — via `TunnelError.kind`.
5. **Never trust SDK teardown to settle.** The opentunnel promise wrapper
   can leave `closed`/`close()` unresolved when a bridge half-dies (idle
   timeout into a route-conflict retry loop). The CLI therefore bounds
   every exit-path await: abort grace 3 s, close cap 3 s, plus an unref'd
   force-exit timer in `src/cli.ts` — upper bounds, never the normal
   path: the provider settles `closed` as soon as the SDK has closed
   the bridge (the wrapper closes it itself on abort), so a Ctrl+C
   leaves right after the SDK close. SIGHUP and SIGTERM get the same
   graceful path as SIGINT — a hard kill skips the bridge close and the
   server keeps the route bound to a ghost session, which is exactly the
   `route_conflict` takeover storm the next run must fight through.
   The plugin closes the bridge on every Vite exit path (verified on
   8.3.8 for dev and preview, SIGINT and SIGTERM):
    - `closeServer` / `closePreviewServer` return the close promise, capped
      at `EXIT_CLOSE_CAP_MS` — Vite awaits hook results before it exits
      (`q`, SIGTERM, stdin closing), but runs NO hook at all on SIGINT;
    - `stop()` returns the promise of a close already in flight: Vite
      closes its HTTP server BEFORE awaiting the hooks, the httpServer
      `close` event starts our close, and a hook that found no handle
      would resolve at once and let `process.exit()` cut the close short;
    - `installExitGuard` owns SIGINT and SIGHUP while a tunnel is live
      (close, then exit with 128 + signal). Node's signal listeners are
      additive — the default "die on SIGINT" only applies while none
      exists, so the handler must exit by itself. A signal somebody else
      already listens on is left to that owner.
6. **Vite snapshots `allowedHosts` at startup.** Vite >= 5.4.12
   answers foreign Host headers with 403, and dev, preview and the HMR
   WebSocket server each freeze a copy of `allowedHosts` BEFORE
   `configureServer` runs — a mutation after that is invisible
   (verified on 8.3.8: the host sits in `config.server.allowedHosts`
   and still gets 403). Two mechanisms, both required:
    - the core routes through the host-rewriting proxy (`hostRewrite`,
      default on): a same-length `*.localhost` alias is always allowed,
      keeps the byte substitution trivial, and covers the CLI, which
      cannot touch the user's vite config;
    - the plugin registers the hostname of a STORED identity in the
      `config` hook, the last moment the list is mutable. A brand-new
      profile mints its hostname later: with `hostRewrite: false` it gets
      403 until the next restart (the plugin prints why).
      Auto-detect the real listening port (port 0/strict ports), don't
      trust the configured one blindly. Default the forward target to
      `localhost` — vite preview on modern Node binds IPv6 loopback only.
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
- Exit-path tests live in `src/vite.lifecycle.test.ts`: the httpServer
  `close` event fires BEFORE the close hooks, exactly as in Vite.
- SDK events reach `onEvent` BEFORE `createTunnel` resolves — the SDK's
  contract is that `route-conflict` arrives while it is still attaching.
  Nothing inside an `onEvent` handler may depend on the tunnel handle.
  `src/vite.lifecycle.test.ts` delivers events in that order on purpose.

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
- **Handshake latency is structural**: TLS terminates in the bridge, so
  DevTools' `SSL` and every request cost one edge → relay → bridge round
  trip (TLS 1.2: two), and only `Initial connection` stops at the edge.
  Measured 2026-11-23 from a far uplink: TCP 135 ms, TLS 295 ms, TTFB
  290 ms, ~455 ms for parallel handshakes; `localhost` answered in 1–8 ms.
  The package adds nothing to it. An HTTP-level provider with
  edge-terminated TLS is the structural fix; the keep-alive hold only
  removes repeated handshakes after pauses.
