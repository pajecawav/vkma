# The cloudflared provider: design and record

Status: implemented on branch `tunnel`, from `e18ff2f` (this design) to
`114e2a5` (plugin and docs), and amended since. The decisions were taken on
2026-11-23, and the measurements were made that day with `cloudflared`
2026.11.0 on Linux amd64.

`AGENTS.md` is the source of the invariants. This file holds what led to
them: the reasons, the measurements and what is still open. Read it before
changing `src/providers/cloudflared*.ts` or quoting a latency number.

## Why

`opentunnel` is a blind TLS tunnel: TLS ends on the developer's machine. The
TLS handshake and every request after it are a full round trip from the edge
through the relay to that machine. Measured from one machine: TCP 135 ms, TLS
295 ms, first byte at 720 ms, and 455 ms of TLS for parallel handshakes,
while `localhost` answered in 1 to 8 ms. An HTTP-level tunnel with TLS
terminated at the provider's edge takes that round trip out of the handshake
and speaks HTTP/2 to the browser. The provider research picked `cloudflared`.

## Decisions

| #   | Decision                                                                                   | Why                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Two modes: quick (no account, one-time URL) and named (a dashboard token, stable hostname) | Quick is the zero-setup path. Named is the only way to keep the package's "stable URL by default" promise. Cloudflare documents that a Quick Tunnel's hostname "changes each time you create" one. |
| D2  | The binary comes from `PATH` only, and nothing is downloaded                               | No supply-chain surface, and no pinned artefacts to maintain. A missing binary is a config error with install hints.                                                                               |
| D3  | `opentunnel` stays the default, and `cloudflared` is opt-in                                | Quick URLs are one-time, and token mode needs an account and a binary. The default gives a stable URL with neither.                                                                                |
| D4  | Connectivity is the user's concern                                                         | The package provides the tunnel and says what it needs. It does not detect or bypass network restrictions.                                                                                         |
| D5  | The default transport is `--protocol http2`                                                | Where UDP 7844 is blocked, QUIC registers and then dies about every 7 s, and `auto` did not fall back within a minute in the measurement. HTTP/2 connected and stayed.                             |

## Measured facts the design rests on

- **URL.** cloudflared prints it on stderr about 5 s after start, inside a
  box, `|  https://<name>.trycloudflare.com  |`, with the notice "it may
  take some time to be reachable".
- **Warm-up is real and has two parts.**
    - DNS. The name's record appeared 1 to 13 s after the URL was printed.
      `trycloudflare.com` has an SOA minimum of 60 s, so a lookup that comes
      too early is cached as NXDOMAIN for a minute.
    - Edge routing. With a registered, healthy bridge, frontends that do not
      know the new tunnel yet answer `530` ("Cloudflare Tunnel error") and
      forward nothing. 7 of the first 9 requests went that way. The 2 that
      reached a warmed-up frontend were proxied and answered `200`.
- **The handshake is cheap when the tunnel works.** The visitor spoke HTTP/2
  to the edge, TCP took 72 ms, TLS finished at 152 ms (both measured on the
  edge's own responses), and the request that went through returned the page
  in 370 ms.
- **Log lines the provider parses** (logfmt, timestamp first):
    - `INF Registered tunnel connection connIndex=0 connection=<uuid> event=0 ip=<ip> location=<colo> protocol=<quic|http2>`
    - `INF Unregistered tunnel connection connIndex=0 …`, `ERR Connection terminated connIndex=0`
    - `ERR Serve tunnel error error="…" connIndex=0 …`, `INF Retrying connection in up to 2s connIndex=0 …`
    - `INF Initiating graceful shutdown due to signal terminated …`, `INF Tunnel server stopped`
    - At `--loglevel debug` every proxied request appears
      (`GET <origin-url> HTTP/2.0 connIndex=0 …`, `200 OK … originService=<service>`).
      At `info` it does not.
- **Shutdown.** SIGTERM is graceful and takes about 0.5 s on a healthy
  bridge. When the control stream is already dead, cloudflared waits its
  whole grace period (30 s by default) and spends it in a busy loop at
  100 % of one core: `runConnections` selects on the closed
  `gracefulShutdownC` without returning (`supervisor/supervisor.go`).
- **The edge connection ignores proxies.** `edgediscovery.DialEdge` dials
  with a bare `net.Dialer`. `HTTPS_PROXY` reaches only the API call that
  creates a Quick Tunnel.
- **QUIC** is cloudflared's default transport. On a path that blocks UDP
  7844 the connection registers and dies about every 7 s
  (`failed to accept QUIC stream: timeout: no recent network activity`).
- **Quick Tunnel limits** come from Cloudflare's docs: no uptime guarantee,
  at most 200 in-flight requests (then `429`), no Server-Sent Events.
- `--http-host-header <value>` is honoured with `--url` only, which means
  quick mode. For token tunnels the equivalent is the dashboard's origin
  setting.
- `--metrics` binds `127.0.0.1:20241` by default and walks up the port range
  when busy.
- Idle CPU is 0 to 2 % of one core, with 16 threads.

## Scope

In scope: provider `cloudflared` (quick and token modes), its config, CLI
flags and plugin options, lifecycle events, bounded teardown, tests against
a fake binary, docs.

Out of scope: downloading the binary; automating `login`, `create` and
`route dns`; several hostnames or ingress rules; `--allowed-mail`; Access
policies; changing the default provider.

## Surface

### Config

```ts
export default defineTunnelConfig({
    provider: "cloudflared",
    cloudflared: {
        mode: "quick", // "quick" (default) or "token"
        hostname: "app.example.com", // token mode: required, the dashboard's public hostname
        token: "…", // token mode: optional here, TUNNEL_TOKEN is preferred
        protocol: "http2", // "http2" (default) or "quic"
        binary: "cloudflared", // a name on PATH, an absolute path, or a path relative to the config file
    },
});
```

Rules:

- A `cloudflared` section while `provider` is not `"cloudflared"` is a
  config error. A mistyped provider must not silently start another one.
- `mode: "token"` without `hostname`, or without a token (in the section or
  in `TUNNEL_TOKEN`), is a config error.
- An `opentunnel` section while `provider` is not `"opentunnel"` is a
  config error in the same way. A provider's options live in its own section
  (`opentunnel: { route, api }`) and not at the top, so a config never
  carries a key that the chosen provider would ignore.

    Amended during the implementation. `route` and `api` used to be top-level
    keys, with a rule pinning `route` to `"@"` for cloudflared. The section
    made both unnecessary.

- Where the token may travel is AGENTS.md, invariant 10.

The provider throws `E_CLOUDFLARED_*` errors. Their conditions sit next to
the throws in `src/providers/cloudflared.ts` and
`src/providers/cloudflared-binary.ts`.

### CLI

`--provider cloudflared`, `--cloudflared-mode quick|token`,
`--cloudflared-hostname <host>`, `--cloudflared-protocol http2|quic`,
`--cloudflared-binary <name-or-path>`. There is no flag for the token,
because `argv` is visible to every process on the machine. `TUNNEL_TOKEN` is
the way.

### Vite plugin

`cloudflared?: { mode, hostname, token, protocol, binary }`, with the same
keys and the same rules. The keep-alive hold and the exit guard apply
unchanged. They live in the core and in the plugin.

## How it works

### Binary

Look the command up in the injected `PATH`. An absolute path is taken as it
is. Check that it is executable, run `--version` once, and parse
`cloudflared version <semver> (built …)`. Cloudflare supports releases for
one year. An older version warns and still runs. On Windows a bare name is
`name.exe`.

### Starting

```
quick:  cloudflared tunnel --no-autoupdate --loglevel info --protocol <p> \
          --url http://<host>:<port> --http-host-header localhost:<port>
token:  cloudflared tunnel --no-autoupdate --loglevel info --protocol <p> run
        (env TUNNEL_TOKEN=<token>)
```

- **The Host header.** In quick mode cloudflared rewrites it to
  `localhost:<port>`, which is what Vite's `allowedHosts` check wants. The
  provider needs neither a plugin option nor the proxy for that. Token mode
  depends on the dashboard's setting. The provider declares its case through
  `TunnelProvider.hostHeaderPolicy` (`"provider"`, `"proxy"` or
  `"unhandled"`). For token mode the core starts no proxy and warns.

    Amended twice during the implementation. An earlier draft had the core's
    proxy cover token mode as a safety net. It cannot, because the
    dashboard's origin URL decides where traffic goes, and the traffic never
    passes a proxy the core could start. And `hostRewrite: false` used to act
    as an opentunnel-only switch. A `"provider"` policy honours it too: quick
    mode then omits `--http-host-header`, and the public Host passes through.

- **Announce only what answers.** `connect()` resolves once three things
  hold, in this order. The URL is known (parsed from stderr in quick mode,
  configured in token mode). A `Registered tunnel connection` line was
  seen. And a `HEAD` request to the public URL returned a status below
  Cloudflare's error range. The first probe waits 2 s after the URL line,
  and the probe repeats every 3 s for at most 60 s. Past that the tunnel is
  announced anyway. The probe never runs before the bridge is registered,
  because a request that arrives first is answered `530` and proves
  nothing.

    The gate also races the process's exit. A death behind it fails the
    settle at once, and no respawn is started for a run that never finished
    starting: as first written, the supervisor launched a replacement for a
    tunnel that was about to be reported as failed, and said `reconnecting`
    above the error.

    Amended during the implementation: the announcement past the cap is
    silent. The draft's `notice` ("Cloudflare may still be routing this
    hostname") and the warning that replaced it printed on every start
    wherever the machine could not reach the edge. So did the reminder that a
    Quick Tunnel URL is one-time. Both were dropped as noise.

- **Events.** Log lines map onto the existing event union. `Registered`
  becomes `connected` the first time and `reconnected` afterwards.
  `Serve tunnel error` and `Retrying` become `disconnected` and
  `reconnecting`. `Unregistered` becomes `disconnected`, and a graceful
  shutdown becomes `stopped`. One event is new: `{ type: "url-changed", url }`.

### Staying up

cloudflared reconnects to the edge by itself, so the supervisor only reacts
to the process dying, and only once the first start has settled. It respawns
with a 1, 2, 4, 8, 16 s backoff, five times, and then rejects `closed` with
`E_CLOUDFLARED_EXITED`.

The five are a streak. A run that stayed up for `respawnResetMs` (60 s)
after it settled was healthy, and its death resets the count: the budget
bounds a run of quick failures, not the lifetime of the tunnel. As first
written the count was never reset, and a watchdog restart spent one too.
The sixth separate death of a day-old tunnel, every earlier one recovered,
ended it with "5 restarts did not keep it up".

A respawn in quick mode mints a new hostname. The supervisor runs the
readiness gate again and emits `url-changed`, and the CLI and the plugin
print a fresh banner.

The health watchdog follows opentunnel's policy with the same numbers: a
probe every 20 s, and a restart after 2 failures. The signal differs. The
Cloudflare edge answers `530` while the tunnel behind it is dead, so here
the status code of the probe is the signal. opentunnel's watchdog asks only
whether anything answered.

### Stopping

SIGTERM, wait at most 3 s, SIGKILL. This is the bounded-teardown invariant
(AGENTS.md, invariant 12) with a sharper reason than usual: on a dead
control stream cloudflared burns a core for its whole 30 s grace period.

### What it needed from the core

- `TunnelProvider.hostHeaderPolicy`, a capability that says who makes the
  Host header acceptable. See "The Host header" above.
- `TunnelEvent` gained `{ type: "url-changed"; url: string }`. The union
  stays additive, and the renderers ignore unknown types.
- Warnings travel through `onWarning`, transient like `onProgress`. The
  draft had a `notice` field on `TunnelProviderConnection` and
  `TunnelHandle`. It was not built.
- `persistentIdentity`, `knownHostname` and `primaryRoute` are capabilities
  added along the way (AGENTS.md, invariant 7).
- Profile records gained `provider`. `"opentunnel"` is implied for existing
  files. A run that stores a record refuses a profile that belongs to
  another provider and fails with `E_PROVIDER_MISMATCH`. Without the check
  a cloudflared run would merge its `hostname` into an opentunnel identity
  and corrupt it.

    Amended during the implementation: only a run that writes a record is
    held to the check. A Quick Tunnel writes none and runs under any profile.
    As first written, the check refused `--provider cloudflared` on every
    project that had an opentunnel identity, and the hint's way out was
    `reset`. Exactly what the check was meant to protect got deleted. The
    hint now offers another profile first and says what `reset` costs.

- Quick Tunnels write no record, because there is nothing stable to store.
  Token mode stores `provider`, `hostname` and the usual target fields. It
  does not store `mode`: a cloudflared record is always a token-mode one.
  `reset` forgets the record and says that the tunnel itself lives in the
  Cloudflare account.

## Testing

The provider never talks to Cloudflare in tests. `installFakeCloudflared` in
`src/test-utils.ts` copies `cloudflared.fake.mjs` into a temp dir and puts
that dir first on the injected PATH. The fake is driven by `FAKE_CF_*`
environment variables. It prints the real log lines on a schedule, dumps
its `argv` to a file, can exit early, and can ignore SIGTERM. Covered:

- binary lookup, the Windows name, a missing binary, version parsing;
- the exact `argv` per mode, and that the token is in the environment only;
- URL parsing from stderr, and the `connected`, `reconnecting` and `stopped`
  mapping;
- the readiness gate: a good status gets the URL announced, the warm-up cap
  gets it announced silently, and no probe runs before `Registered`;
- `hostRewrite: false` reaching the child's `argv`;
- respawn and `url-changed`, the respawn budget as a streak (a stable run
  resets it, a quick failure does not) and its end in `E_CLOUDFLARED_EXITED`;
- a teardown that stays bounded when the child ignores SIGTERM.

A live check is a manual step, because it needs a network that reaches
Cloudflare. The one that was done is recorded below.

## Limitations that stay

- **Quick Tunnels are one-time URLs with a warm-up and Cloudflare's
  limits.** The README and the docs page say so. Nothing prints it per run,
  because a line on every start was noise.

## Verified live, 2026-11-23, evening

From this machine, whose network reached Cloudflare directly at the time.
No route was changed for it, and an hour earlier the same machine could not
make a URL answer for a whole warm-up cap. Setup: `cloudflared` 2026.11.0
(built 20261113), a Vite 8.3.8 dev server with a one-page app, Linux amd64.

| Check                                                                  | Result                                                                                                                                                                                             |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Quick Tunnel announced                                                 | 9 s after start in three of four timed runs, 24 s in the fourth                                                                                                                                    |
| `GET /` through the tunnel                                             | `200` with the page; `/@vite/client` `200`                                                                                                                                                         |
| Host the origin sees, default                                          | `localhost:<port>`, so `--http-host-header` does what the documentation says                                                                                                                       |
| `--no-host-rewrite`                                                    | Vite answers `403` `Blocked request. This host ("….trycloudflare.com") is not allowed.` The public Host passes through when the flag is omitted, and no request reached the app                    |
| `--no-host-rewrite` with `server.allowedHosts: ['.trycloudflare.com']` | `200`, and the origin sees `….trycloudflare.com`. The hint's advice is enough                                                                                                                      |
| HMR WebSocket (`new WebSocket(url, "vite-hmr")`)                       | opens, and Vite sends `{"type":"connected"}`. Likewise with the suffix allowed. With nothing allowed it never opens (`1006`)                                                                       |
| First request on a fresh connection                                    | opentunnel (route `mobile`, identity minted in 19 s): TCP 207 ms, TLS 505 ms, total 787 ms. cloudflared, five samples: total 280 to 347 ms; TCP 70 ms and TLS 150 ms in the two that measured them |
| Ctrl+C                                                                 | the CLI exits about 0.4 s after SIGINT with cloudflared and about 0.2 s with opentunnel                                                                                                            |

opentunnel went through the same CLI after its section took over `route`.
`--opentunnel-route mobile` served `https://mobile.<id>.opentunnel.xyz` and
stamped `lastRoute: "mobile"`.

Every run left nothing behind: no child process, and no record in a quick
mode sandbox. The two opentunnel runs minted throwaway identities on the
hosted service (`4edtlx3xtdm5`, `bdjc23j557sl`). Their local records went
with the sandbox.

## Open

- **A machine that cannot reach the edge while its visitors can.** The
  warm-up gate and the health watchdog both probe from the machine, and by
  code a probe with no answer at all counts exactly like an error status.
  So in that case a start waits out the whole cap, silently, and the
  watchdog restarts a tunnel that may be serving fine, which gives a new
  Quick Tunnel URL every cycle. This was not reproduced: in the earlier
  evening runs nobody could reach the URL, so the two cases could not be
  told apart. The fix would let only an edge answer in the error range mean
  "the tunnel is down", and read "no answer" as "this machine's
  reachability is in doubt".
- Token mode with a real token. It needs a hostname on a Cloudflare zone.
- `protocol: "quic"` on a network where it can work.
- The URL opened inside a VK client (the iframe on a phone).
- Windows (the `cloudflared.exe` lookup is tested by naming the platform)
  and macOS. No machine here has run either.
- Whether the readiness probe should pin the zone apex's address instead of
  resolving the new name. Pinning avoids the NXDOMAIN cache, but one such
  probe answered `530` while a plain one answered `200` in the same second.
  Most likely that was warm-up noise and not the pinning.

## History

The plan was one commit per step, on branch `tunnel`:

1. The design, `e18ff2f`.
2. The config surface, `ae9430f`.
3. The binary lookup and version check, with the shared provider pieces
   extracted from opentunnel, `f51a6b1`.
4. The provider, quick and token modes together, `f187f85`. The plan had
   these as two steps.
5. Core wiring and CLI, `84907f9`. `hostHeaderPolicy` replaced
   `handlesHostHeader`, and there is no `notice` field.
6. Plugin options, docs and the changeset, `114e2a5`.

The amendments above record what later commits changed.
