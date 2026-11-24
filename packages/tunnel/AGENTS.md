# packages/tunnel

`@vkma.dev/tunnel` gives local VK Mini App servers public HTTPS tunnels
through a CLI (`vkma-tunnel`), a Node API (`createTunnel`) and a Vite plugin
(`@vkma.dev/tunnel/vite`). It has two providers. `opentunnel` is the default
(blind TLS tunnels, no accounts, stable URLs). `cloudflared` is opt-in
(Cloudflare Tunnel through the `cloudflared` binary).

`DESIGN.md` holds the cloudflared provider's decisions, its live measurements
and the list of what is still open. Read it before changing
`src/providers/cloudflared*.ts` and before quoting a latency number.

Write comments, commits and docs in English.

## Commands

- `pnpm build` runs tsdown and writes an ESM-only `dist/` that mirrors `src/`
  file by file (entries: `src/index.ts`, `src/vite.ts`, `src/cli.ts`).
- `pnpm test` runs vitest on the co-located `*.test.ts` files. None of them
  needs the network (see Testing notes).
- `pnpm schema` regenerates `schema/vkma-tunnel.config.schema.json`. Run it
  after changing `src/config/schema.ts`; a test fails when the two differ.
- `node dist/cli.js --help` prints the CLI help and proves the build runs.

## Architecture map

- `src/config/` holds the TypeBox schema (it doubles as the JSON Schema),
  walk-up discovery, and TS config loading through native
  `module.stripTypeScriptTypes` (the write-to-temp-sibling trick). Its
  `emitWarning` shim is the one exception to the `process` rule in invariant
  3, as in deploy.
- `src/core/` is the provider-neutral surface: `types.ts` (`TunnelHandle`,
  `TunnelProvider`, the event union), `tunnel.ts` (`createTunnel`: defaults,
  validation, provider dispatch), `profile.ts` (the default profile is the
  sanitized project directory basename) and `identity.ts` (record files under
  the data dir, the read and remove functions the CLI uses, and
  `readProfileRecordFile` / `removeRecordIfUntouched` for who owns a
  profile — invariant 1).
- `src/providers/opentunnel.ts` is the default provider and the
  `OpenTunnelStorage` adapter over our record files. It does not use the
  SDK's XDG store: the format is ours, with shared metadata beside the
  identity. The file also supervises the bridge (watchdog restarts; the
  SDK's own close on abort settles `closed`).
- `src/providers/event-stream.ts` is the merged event stream every provider
  hands to the core. It keeps a bounded tail until something iterates it,
  streams live afterwards, and ends when the tunnel stops. The CLI and the
  plugin never iterate it, so the buffer stays bounded.
- `src/providers/probe.ts` has two HTTP probes because the providers read
  different signals. `probeHttp` reports whether anything at all answered
  (opentunnel's watchdog). `httpStatus` reports what answered (cloudflared's:
  the Cloudflare edge answers `530` while the tunnel behind it is dead).
- `src/providers/cloudflared-binary.ts` looks up `cloudflared` on PATH (the
  package never downloads it) and runs the `--version` check.
- `src/providers/cloudflared.ts` is the cloudflared provider: a child process
  whose logfmt output is parsed, a warm-up gate before a Quick Tunnel is
  announced, respawns with backoff (`url-changed` when a Quick Tunnel comes
  back under a new hostname; the five are a streak — a run that stayed up
  for `respawnResetMs` after it settled resets the count on its death), a
  hard-capped teardown and the health watchdog.
  `cloudflared.fake.mjs` is its test double and is not published.
- `src/proxy.ts` is the loopback host-rewriting forward proxy. It swaps the
  tunnel hostname for a same-length `*.localhost` alias by pure byte
  substitution, so WS upgrades pass through. It holds back a suffix that may
  still complete into the hostname and releases it after a 50 ms idle window
  (`HOLD_FLUSH_MS`). Keep that release: without it, a request body or WS
  frame whose last byte is a hostname prefix hangs forever.
- `src/cli/` holds the argv parser, `logger.ts` (pretty, json and quiet
  renderers and the elapsed-time spinner, adapted from deploy's CliLogger),
  `main.ts` (dispatch and rendering; it returns exit codes instead of calling
  `process.exit`), `qr.ts` and `opener.ts`. `src/cli.ts` is the shebang entry
  that wires SIGINT and SIGTERM.
- `src/vite.ts` is the plugin for dev and preview: the `config` hook that
  registers a stored hostname in `allowedHosts`, the tunnel lifecycle, the
  awaited close hooks, and the keep-alive hold (the server's
  `keepAliveTimeout` goes to 2 min while a tunnel is live, ref-counted per
  httpServer because Vite restarts reuse it). `src/vite-exit.ts`, internal
  and not exported from `/vite`, holds the exit guard and the bounded close.
  The plugin reads the port the server actually listens on, because Vite may
  pick another one with port 0 or `strictPort`. It forwards to `localhost` by
  default, because `vite preview` on modern Node binds IPv6 loopback only.

## Invariants

Each invariant states a rule and the reason behind it. The reason is what
tells a well-meant change from a breaking one.

1. **Stable URL by default.** The identity persists per profile in
   `$XDG_DATA_HOME/vkma/tunnel/<profile>.json` (mode 0600, atomic writes), and
   `reset` is the only way to rotate it. A provider record keeps the shared
   fields `hostname`, `lastTarget`, `lastRoute`, `pid`, `startedAt`,
   `createdAt` and `updatedAt`, because the CLI's `list` and `status` read
   them without knowing the provider. `pid` and `startedAt` name the process
   that holds the bridge: the core stamps them only after a successful
   attach. A stamp at
   start would overwrite the incumbent's pid before our first attempt, and
   the route-conflict hint would then always find itself. The hint
   (`src/cli/conflict-hint.ts`, shared by CLI and plugin) tells a live holder
   ("stop it") from a dead one ("the service still holds its route").

    **A profile belongs to one provider.** The record carries `provider`
    (absent means opentunnel: the field is younger than the second provider).
    A run that stores a record refuses a profile another provider owns and
    fails with `E_PROVIDER_MISMATCH`, because two providers on one file would
    overwrite each other's `hostname` and corrupt an opentunnel identity. A
    run with nothing stable to store (`persistentIdentity` false, a cloudflared
    Quick Tunnel) writes no record, reads no identity and owns no profile, so
    it runs under any. Keep the check limited to storing runs. As first
    written, it refused `--provider cloudflared` on every project that had
    ever run the default tunnel, and its hint offered `reset` as the way out.
    A stable URL was deleted to try a one-time tunnel. The hint now offers
    another profile first and says what `reset` deletes, and `reset` prints
    the URL it removes.

    Two more rules came out of the same check:

    - The owner is read from the FILE (`readProfileRecordFile`), not through
      the hostname. An opentunnel identity in the making has none yet: the
      SDK stores a `pending` record before the certificate is issued, and a
      first run interrupted during that wait leaves exactly that. Read
      through the hostname it was invisible, and a cloudflared token run
      took the profile over and left opentunnel refused on it.
    - A run that cannot even connect owns no profile. The stamp the core
      writes before a connect is taken back when that connect fails —
      unless the provider put something of its own into the file
      (`removeRecordIfUntouched`). As first written, a token run that failed
      on a missing token or binary left `provider: "cloudflared"` behind,
      and from then on the default tunnel was refused on that project.

    The hint is true for both providers: it says `reset` deletes what the
    owner stored and that a minted identity loses its URL. It used to
    promise a lost URL for a cloudflared record too, whose tunnel lives in
    the account and keeps its hostname.

2. **Layering is fixed**: CLI flags and plugin options > config file >
   defaults. The plugin always tunnels the Vite server it is attached to.
   Its `port` and `host` options retarget it; the config-file keys belong to
   the CLI and the Node API and do not. For the plugin the Vite root is the
   project, so config discovery and the default profile start there and not
   at the launch directory. There is no environment layer for config by
   design. The SDK reads `OPENTUNNEL_API` itself; leave it to the SDK.
3. **The library reads `process` in five places only.** `process.env` is the
   default value of the injected `env` (data dir, PATH). `process.cwd()` is
   the default `cwd` of `resolveTunnelConfig`. `process.platform` is the
   default platform of the cloudflared binary lookup (on Windows a bare name
   is `name.exe` and the variable is `Path`). Config loading installs the
   documented `stripTypeScriptTypes` warning shim. `process.pid` is stamped
   into the profile record so that a route conflict can point at the rival
   process. Console logging and the browser opener belong to `src/cli*` and
   `src/vite.ts` only.
4. **A fatal tunnel leaves the dev server running.** The plugin prints a red
   line (devtools policy). The browser opener belongs under the same rule:
   a missing `xdg-open` (Linux without xdg-utils) reports through an
   `error` event, not a throw, and an `error` event without a listener is
   an uncaught exception. `launchOpener` installs the listener. The CLI maps
   failures to exit codes through `TunnelError.kind`: 0 ok, 1 config or
   user, 2 network, 130 aborted.
5. **Bound every exit-path await.** The opentunnel promise wrapper can leave
   `closed` and `close()` unresolved when a bridge half-dies (an idle timeout
   into a route-conflict retry loop). The CLI therefore caps each wait on the
   exit path: abort grace 3 s, close cap 3 s (or the handle's
   `closeTimeoutMs` when the provider's own teardown bound is longer), plus
   an unref'd force-exit timer in `src/cli.ts`. These caps are upper bounds
   and not the normal path. The provider settles `closed` as soon as the SDK
   has closed the bridge (the wrapper closes it itself on abort), so a
   Ctrl+C leaves right after the SDK close. SIGHUP and SIGTERM take the same
   graceful path as SIGINT. A hard kill skips the bridge close, the server
   keeps the route bound to the closed session, and the next run gets
   `route_conflict` errors until it takes the route over.

    The plugin closes the tunnel on every Vite exit path (verified on 8.3.8
    for dev and preview, SIGINT and SIGTERM):
    - `closeServer` and `closePreviewServer` return the close promise, capped
      at `EXIT_CLOSE_CAP_MS` (1.5 s) or at the handle's `closeTimeoutMs` when
      the provider's own teardown bound is longer. Vite awaits hook results
      before it exits on `q`, SIGTERM and stdin closing, and it runs no hook
      at all on SIGINT.
    - `stop()` returns the promise of a close already in flight. Vite closes
      its HTTP server before it awaits the hooks; the httpServer `close`
      event starts our close, and a hook that found no handle would resolve
      at once and let `process.exit()` cut the close short.
    - A tunnel that is still starting has no handle. Every start is
      registered from its first line (`trackStart`), and `stop()` aborts
      its signal and waits for the provider to unwind, inside the same cap
      (`closeLimit` holds the provider's bound once the config named it).
      As first written the start ran on after the server closed: a
      cloudflared child outlived Vite, and the tunnel came up on a server
      that was gone and printed its banner. A tunnel that goes live
      supersedes the other starts the same way.
    - `installExitGuard` owns SIGINT and SIGHUP while a tunnel is live: it
      closes the tunnel and exits with 128 + signal. Node's signal listeners
      are additive, and the default "die on SIGINT" applies only while no
      listener exists, so the handler has to exit by itself. It leaves a
      signal that somebody else already listens on to that owner.

6. **Vite snapshots `allowedHosts` at startup.** Vite >= 5.4.12 answers
   foreign Host headers with 403, and dev, preview and the HMR WebSocket
   server each freeze a copy of `allowedHosts` before `configureServer` runs.
   A mutation after that is invisible (verified on 8.3.8: the host sits in
   `config.server.allowedHosts` and still gets 403). Two mechanisms cover the
   cases, and both are needed:
    - The core routes requests through the host-rewriting proxy
      (`hostRewrite`, on by default). A same-length `*.localhost` alias is
      always allowed, the byte substitution stays trivial, and the CLI is
      covered too, since it cannot touch the user's vite config.
    - The plugin registers in the `config` hook the hostname of an identity
      that is already stored, the last moment the list can change. A brand-new profile gets its
      hostname later. With `hostRewrite: false` it then gets 403 until the
      next restart, and the plugin prints why.
7. **The provider registry is closed** (`opentunnel`, `cloudflared`). The
   `TunnelProvider` type is public, and adding a provider is a package
   release, not a runtime plugin API. A provider tells the core what it needs
   to know through optional capabilities (`hostHeaderPolicy`,
   `persistentIdentity`, `knownHostname`, `primaryRoute`). The core does not
   branch on `provider.id` and reads no provider's config section. Provider
   ids come from one list, `TUNNEL_PROVIDER_IDS` in `constants.ts`: the
   registry `satisfies Record<TunnelProviderId, TunnelProvider>`, the JSON
   Schema enumerates them, and `provider` is typed as the union everywhere
   (config, flags, plugin, `createTunnel`, the handle). Keep that type. With
   it a typo is a config error that names the valid ids; with `string` it
   became an `E_UNKNOWN_PROVIDER` after the dev server had started. Records
   on disk keep `provider?: string`, because they are input.
8. `engines` is Node >= 22.18 because config files rely on native TS
   stripping. Keep it there.
9. **The provider decides who makes the Host header acceptable**
   (`hostHeaderPolicy`). With `"proxy"` the core's rewriting proxy does it
   (opentunnel). With `"provider"` the provider does it itself (cloudflared
   quick mode, `--http-host-header`) and the core starts no proxy. With
   `"unhandled"` nobody can: in cloudflared token mode the dashboard's origin
   settings decide where traffic goes, and it never passes a proxy the core
   could start, so the core warns instead. The proxy cannot help token mode,
   because it cannot see that traffic.

    `hostRewrite` is one switch for both mechanisms, not an opentunnel option.
    The connect options carry it, and a `"provider"` policy honours `false`:
    cloudflared quick mode then omits `--http-host-header`, and the public
    Host reaches the target, since no proxy stands behind it. With the switch
    off, token mode needs no warning, because the public Host is what was
    asked for. A Quick Tunnel's name is new on every start, so the hints then
    tell the user to allow the suffix `.trycloudflare.com`.

10. **A cloudflared token reaches the child through `TUNNEL_TOKEN` in its
    environment only.** It stays out of `argv` (visible to every process),
    out of profile records and out of log lines, which is why there is no
    `--cloudflared-token` flag.
11. **Announce only what answers.** A Quick Tunnel's DNS record appears
    seconds after cloudflared prints its URL, a lookup that comes earlier is
    cached as NXDOMAIN for a minute, and edge frontends answer `530` until
    they know the route. The provider therefore waits before the first probe
    and announces the URL only on a status below Cloudflare's error range. If
    the process dies behind that gate, the start fails, so the handle never
    carries a dead URL. The gate races the exit, and the supervisor answers
    a death only once the first settle succeeded (`started`). As first
    written, it respawned from behind the gate too: a `reconnecting` line
    above the failure and a replacement child for a tunnel that was about to
    be reported as failed. Past the cap (`warmupCapMs`) the URL is announced
    without a check and without a line about it, in every surface and in the
    Node API. The CLI and the plugin used to print one. It appeared on every
    start wherever the machine could not reach the edge. The same holds for
    the reminder that a Quick Tunnel URL is one-time: the option chose it,
    and the README says it. A line on every start has to be something the
    user can act on.
12. **cloudflared teardown is hard-capped**: SIGTERM, 3 s, then SIGKILL. On a
    dead control stream cloudflared spins a core at 100 % for its whole 30 s
    grace period. Its edge connection ignores proxies by design
    (`net.Dialer`), so the provider gives cloudflared the environment as it
    is.

    The cap is only as good as the longest wait for it. The provider
    declares the whole of it (5 s) as `closeTimeoutMs`, the core copies
    the number onto the handle, and the CLI and the plugin wait at least
    that long on their exit paths. The plugin's own cap was 1.5 s on its
    own: a child that took its time outlived Vite, and the SIGKILL for a
    wedged one never went out.

13. **The config's top level holds what every provider understands**
    (`provider`, `port`, `host`, `profile`). A provider's own options live in
    its section (`opentunnel: { route, api }`, `cloudflared: { … }`), and its
    CLI flags carry its prefix (`--opentunnel-route`, `--cloudflared-mode`).
    A section beside another provider's id is a config error, so that no key
    is silently ignored (`api` beside cloudflared used to be accepted and
    dropped). Each provider reads its own section and applies its own
    defaults (see 7).

## Testing notes

- Tests write only to throwaway dirs (`fs.mkdtemp` next to the test file).
  Pass both `dataDir` and an `env` whose `XDG_DATA_HOME` points into the
  sandbox. A lost `dataDir` option falls back to the real store. It happened
  once, when a shorthand property replaced the option, and two test profiles
  landed in the user's store.
- The cloudflared provider runs against `cloudflared.fake.mjs`, which
  `installFakeCloudflared` puts on the injected PATH. The fake emits real log
  lines, records its argv, and crashes or ignores SIGTERM on request. `fetch`
  is stubbed. Each test shrinks `cloudflaredTimings` and `afterEach` restores
  it. No network and no real binary are involved.
- The cloudflared binary lookup's Windows branch is tested by naming the
  platform. No Windows machine has run it.
- The `status` probe test starts a real loopback `http.Server`; nothing goes
  beyond 127.0.0.1.
- Tests exercise the opentunnel SDK only through its storage adapter. A live
  CLI check (`node dist/cli.js` with a local server on 5173) is a manual
  step.
- Shutdown resilience tests inject a `createTunnel` fake whose `closed` and
  `close()` never settle. The CLI must still exit through the abort grace
  path, which proves that the exit does not depend on third-party teardown.
- Exit-path tests live in `src/vite.lifecycle.test.ts`. There the httpServer
  `close` event fires before the close hooks, exactly as in Vite.
- SDK events reach `onEvent` before `createTunnel` resolves. By the SDK's
  contract `route-conflict` arrives while it is still attaching, so an
  `onEvent` handler has to work without the tunnel handle.
  `src/vite.lifecycle.test.ts` delivers events in that order on purpose.

## Known service behaviour

These come from the services. The package does not cause them.

- **Bridge idle timeout into a route-conflict loop.** When the network path
  half-dies, the client's idle watchdog tears the bridge down, but the close
  frame cannot be delivered. The server keeps the route bound to the closed
  session, reconnects get `route_conflict` until the server reaps it, and
  then the SDK retries and takes the route over. The CLI renders this as
  `route held by another bridge (@), taking over…`, and the user has to wait
  it out. The provider's self-probe (`keepAlive`, on by default) prevents the
  traffic-idle variant. It cannot produce a pong that the path does not
  deliver.
- **First certificate issuance** takes minutes on the hosted service. The
  progress lines (`waiting-certificate…`) exist for that wait.
- **Handshake latency is structural for opentunnel.** TLS terminates in the
  bridge, so DevTools' `SSL` and every request cost one edge, relay, bridge
  round trip (two with TLS 1.2), and only `Initial connection` stops at the
  edge. Measured on 2026-11-23 from a far uplink: TCP 135 ms, TLS 295 ms,
  TTFB 290 ms, about 455 ms for parallel handshakes, while `localhost`
  answered in 1 to 8 ms. The package adds nothing to it. The keep-alive hold
  only removes repeated handshakes after pauses. The `cloudflared` provider
  is the fix that changes the structure; its numbers are in `DESIGN.md`.
