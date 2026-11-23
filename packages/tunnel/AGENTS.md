# AGENTS.md — packages/tunnel

Public HTTPS tunnels for local VK Mini App servers: CLI (`vkma-tunnel`),
Node API (`createTunnel`), Vite plugin (`@vkma.dev/tunnel/vite`). Providers:
`opentunnel` (default; blind TLS tunnels, no accounts, stable URLs) and
`cloudflared` (opt-in; Cloudflare Tunnel through the `cloudflared` binary —
`DESIGN.md` holds its design and measurements). Keep all comments,
commits, and docs in English.

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
- `src/providers/opentunnel.ts` — the default provider + the
  `OpenTunnelStorage` adapter over our record files (NOT the SDK's XDG
  store: our format, shared metadata beside the identity). It also
  supervises the bridge (watchdog restarts; the SDK's own close on abort
  settles `closed`).
- `src/providers/event-stream.ts` — the merged event stream every
  provider hands to the core: a bounded tail until iterated, live
  afterwards, ended when the tunnel stops — never an unbounded queue, the
  CLI and the plugin never iterate it.
- `src/providers/probe.ts` — two HTTP probes: `probeHttp` (did ANYTHING
  answer — opentunnel's watchdog) and `httpStatus` (WHAT answered —
  cloudflared's: the Cloudflare edge answers `530` while the tunnel
  behind it is dead).
- `src/providers/cloudflared-binary.ts` — PATH lookup of `cloudflared`
  (never downloaded) and the `--version` check.
- `src/providers/cloudflared.ts` — the cloudflared provider: a child
  process whose logfmt output is parsed, a warm-up gate before a Quick
  Tunnel is announced, respawns with backoff (`url-changed` when a Quick
  Tunnel comes back under a new hostname), a hard-capped teardown and the
  health watchdog. `cloudflared.fake.mjs` is its test double (not
  published).
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
   **A profile belongs to ONE provider.** The record carries `provider`
   (absent = opentunnel, written before the second provider existed);
   the core refuses another provider on a taken profile
   (`E_PROVIDER_MISMATCH`) — two providers on one file would overwrite
   each other's `hostname` and corrupt an opentunnel identity. Runs with
   nothing stable to store (`persistentIdentity` false — a cloudflared
   Quick Tunnel) write no record, read no identity and own no profile:
   they run under ANY. Do not extend the check to them. It refused
   `--provider cloudflared` on every project that had ever run the
   default tunnel, and its hint offered `reset` as the way out — a
   stable URL was dropped to try a one-time tunnel. The hint offers
   another profile first and names what `reset` destroys; `reset`
   prints the URL it removes.
2. **Layering is fixed**: CLI flags / plugin options > config file >
   defaults. The plugin always tunnels the Vite server it is attached
   to: its `port`/`host` options retarget it, the config-file keys do
   not (they belong to the CLI and the Node API). For the plugin the
   Vite root is the project — config discovery and the default profile
   start there, not at the launch directory. No env layer by design;
   `OPENTUNNEL_API` is read natively by the SDK, don't shadow it.
3. **The library never touches `process`** outside injected `env`
   (identity store default param, `resolveTunnelConfig` cwd default, the
   cloudflared binary lookup's platform default — on Windows a bare name
   is `name.exe` and the variable is `Path`), the documented
   `stripTypeScriptTypes` warning shim, and `process.pid` (stamped into
   the profile record so route conflicts can point at the rival process
   — no side effects). Only `src/cli*` and `src/vite.ts` (console
   logging, browser opener) may. The lookup's Windows branch is tested
   by naming the platform; no Windows machine has run it.
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
7. **Provider registry is closed** (`opentunnel`, `cloudflared`). The
   `TunnelProvider` type is public; adding a provider is a package
   release, not a runtime plugin API. Providers declare what the core
   must know through optional capabilities — `hostHeaderPolicy`,
   `persistentIdentity`, `knownHostname`, `primaryRoute` — never by making
   the core branch on `provider.id` or read a provider's config section. Ids come from ONE list, `TUNNEL_PROVIDER_IDS`
   (`constants.ts`): the registry `satisfies Record<TunnelProviderId,
   TunnelProvider>`, the JSON Schema enumerates them and `provider` is
   typed as the union everywhere (config, flags, plugin, `createTunnel`,
   the handle). Never widen it back to `string` — a typo must be a
   config error with the valid ids named, not an `E_UNKNOWN_PROVIDER`
   after the dev server started. (Records on disk keep `provider?:
   string`: they are input.)
8. Node >= 22.18 (native TS stripping for config files); `engines` is
   meaningful, don't lower it silently.
9. **Who makes the Host header acceptable is the provider's call**
   (`hostHeaderPolicy`). `"proxy"`: the core's rewriting proxy
   (opentunnel). `"provider"`: the provider does it itself (cloudflared
   quick mode, `--http-host-header`) and the core starts no proxy.
   `"unhandled"`: nobody can — cloudflared token mode, where the
   dashboard's origin settings decide where traffic goes and it never
   passes a proxy the core could start; the core warns instead. Do not
   "fix" token mode with the proxy: it cannot see that traffic.
   `hostRewrite` is one switch for both mechanisms, not an opentunnel
   option: the connect options carry it, and a `"provider"` policy MUST
   honour `false` — cloudflared quick mode then omits
   `--http-host-header` and the public Host reaches the target, since no
   proxy stands behind it to do so. With the switch off token mode warns
   no more: the public Host is what was asked for. A Quick Tunnel's name
   is new on every start, so the hints then say to allow the SUFFIX
   (`.trycloudflare.com`), never "restart to pick up the hostname".
10. **A cloudflared token reaches the child through `TUNNEL_TOKEN` in its
    environment only** — never `argv` (visible to every process), never
    a profile record, never a log line. There is deliberately no
    `--cloudflared-token` flag.
11. **Announce only what answers.** A Quick Tunnel's DNS record appears
    seconds after cloudflared prints its URL and a lookup that comes
    earlier is cached as NXDOMAIN for a minute; edge frontends answer
    `530` until they know the route. The provider waits before the first
    probe and gates the announcement on a status below Cloudflare's error
    range. If the process dies behind that gate the START fails — never
    announce a URL that is already dead. Past the cap the URL is announced
    unverified and SILENTLY: neither surface nor the Node API gets a line
    about it. The one that existed ("does not answer yet") printed on
    every start wherever the machine cannot reach the edge; the same goes
    for reminding that a Quick Tunnel URL is one-time — the option chose
    it and the README says it. A line on every start must be something
    the user can act on.
12. **cloudflared teardown is hard-capped** (SIGTERM, 3 s, SIGKILL). On a
    dead control stream it spins a core at 100 % for its whole 30 s grace
    period. `cloudflared`'s edge connection ignores proxies by design
    (`net.Dialer`); do not add proxy plumbing for it.
13. **The config's top level is what every provider understands**
    (`provider`, `port`, `host`, `profile`); a provider's own options live
    in its section (`opentunnel: { route, api }`, `cloudflared: { … }`) and
    its CLI flags carry its prefix (`--opentunnel-route`,
    `--cloudflared-mode`). A section beside another provider's id is a
    config error — never a silently ignored key: `api` beside cloudflared
    used to be accepted and dropped. The core reads no section (see 7);
    each provider reads its own and applies its own defaults.

## Testing notes

- Tests use throwaway dirs (`fs.mkdtemp` next to the test file); never
  touch the real XDG store. Pass BOTH `dataDir` and an `env` whose
  `XDG_DATA_HOME` points into the sandbox: a lost `dataDir` option falls
  back to the real one (it happened once — a shorthand property ate the
  option — and two test profiles landed in the user's store).
- The cloudflared provider is tested against `cloudflared.fake.mjs`
  (installed on the injected PATH by `installFakeCloudflared`): real log
  lines, argv recording, crashes on request, SIGTERM ignored on request.
  `fetch` is stubbed; `cloudflaredTimings` is shrunk per test and
  restored in `afterEach`. No network, no real binary.
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
