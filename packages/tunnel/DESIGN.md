# cloudflared provider — design

Status: **implemented** (commits `9024a2d` → the docs commit that follows
this note). Decisions were taken on 2026-11-23; the measurements below were
made on that day with `cloudflared` 2026.11.0 on Linux amd64. `AGENTS.md` stays the source of invariants; this file is the plan
the implementation follows and the record of why it looks the way it does.

## Why

`opentunnel` is a blind TLS tunnel: TLS ends on the developer's machine, so
the TLS handshake and every request pay a full
edge → relay → machine round trip. Measured from one machine: TCP 135 ms, TLS
295 ms, first byte at 720 ms, and 455 ms of TLS for parallel handshakes —
while `localhost` answered in 1–8 ms. An HTTP-level tunnel with TLS
terminated at the provider's edge removes that round trip from the handshake
and speaks HTTP/2 to the browser. The provider research picked `cloudflared`.

## Decisions

| #   | Decision                                                                                           | Why                                                                                                                                                                                                |
| --- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Two modes: **quick** (no account, one-time URL) and **named** (a dashboard token, stable hostname) | Quick is the zero-setup path; named is the only way to keep the package's "stable URL by default" promise — Cloudflare documents that a Quick Tunnel's hostname "changes each time you create" one |
| D2  | The binary comes from `PATH` only; nothing is downloaded                                           | No supply-chain surface, no pinned artefacts to maintain. A missing binary is a config error with install hints                                                                                    |
| D3  | `opentunnel` stays the default; `cloudflared` is opt-in                                            | Quick URLs are one-time, and token mode needs an account and a binary. The default gives a stable URL with neither.                                                                                |
| D4  | Connectivity is the user's concern                                                                 | We provide the tunnel and say plainly what it needs; we do not detect or bypass network restrictions                                                                                               |
| D5  | Default transport is `--protocol http2`                                                            | Where UDP 7844 is blocked, QUIC registers and then dies every ~7 s; `auto` did not fall back within a minute in the measurement. HTTP/2 connected and stayed                                       |

## Measured facts the design rests on

- **URL**: printed on **stderr** about 5 s after start, inside a box:
  `|  https://<name>.trycloudflare.com  |`, with the notice "it may take some
  time to be reachable".
- **Warm-up is real and has two parts.**
    - DNS: the name's record appeared 1–13 s after the URL was printed.
      `trycloudflare.com` has an SOA minimum of 60 s, so a lookup that comes
      too early is cached as NXDOMAIN for a minute.
    - Edge routing: with a registered, healthy bridge, frontends that do not
      know the new tunnel yet answer `530` ("Cloudflare Tunnel error") without
      forwarding anything — 7 of the first 9 requests went that way, while the
      2 that reached a warmed-up frontend were proxied and answered `200`.
- **It works, and the handshake is cheap when it works**: the visitor spoke
  **HTTP/2** to the edge, TCP took 72 ms and TLS finished at 152 ms (measured
  on the edge's own responses); the request that went through returned the
  page in 370 ms.
- **Log lines the provider parses** (logfmt, timestamp first):
    - `INF Registered tunnel connection connIndex=0 connection=<uuid> event=0 ip=<ip> location=<colo> protocol=<quic|http2>`
    - `INF Unregistered tunnel connection connIndex=0 …`, `ERR Connection terminated connIndex=0`
    - `ERR Serve tunnel error error="…" connIndex=0 …`, `INF Retrying connection in up to 2s connIndex=0 …`
    - `INF Initiating graceful shutdown due to signal terminated …`, `INF Tunnel server stopped`
    - at `--loglevel debug` every proxied request appears
      (`GET <origin-url> HTTP/2.0 connIndex=0 …`, `200 OK … originService=<service>`);
      at `info` it does not.
- **Shutdown**: SIGTERM is graceful — about 0.5 s on a healthy bridge. When
  the control stream is already dead, cloudflared waits its whole grace
  period (30 s by default) and spends it in a busy loop at 100 % of one core:
  `runConnections` selects on the closed `gracefulShutdownC` without
  returning (`supervisor/supervisor.go`).
- **The edge connection ignores proxies**: `edgediscovery.DialEdge` dials with
  a bare `net.Dialer`; `HTTPS_PROXY` reaches only the API call that creates
  a Quick Tunnel.
- **QUIC**: the default transport. On a path that blocks UDP 7844 the
  connection registers and dies about every 7 s
  (`failed to accept QUIC stream: timeout: no recent network activity`).
- **Quick Tunnel limits** (Cloudflare's docs): no uptime guarantee, at most
  200 in-flight requests (then `429`), no Server-Sent Events.
- `--http-host-header <value>` is honoured with `--url` only, i.e. in quick
  mode; for token tunnels the equivalent is the dashboard's origin setting.
- `--metrics` binds `127.0.0.1:20241` by default and walks up the port range
  when busy.
- Idle CPU: 0–2 % of one core, 16 threads.

## Scope

In: provider `cloudflared` (quick and token modes), its config, CLI flags and
plugin options, lifecycle events, bounded teardown, tests against a fake
binary, docs.

Out: downloading the binary; automating `login` / `create` / `route dns`;
several hostnames or ingress rules; `--allowed-mail`; Access policies;
changing the default provider.

## Surface

### Config

```ts
export default defineTunnelConfig({
    provider: "cloudflared",
    cloudflared: {
        mode: "quick", // "quick" (default) | "token"
        hostname: "app.example.com", // token mode: required, the dashboard's public hostname
        token: "…", // token mode: optional here; TUNNEL_TOKEN is preferred
        protocol: "http2", // "http2" (default) | "quic"
        binary: "cloudflared", // a command name on PATH, or an absolute path
    },
});
```

Rules:

- `cloudflared` set while `provider` is not `"cloudflared"` is a config
  error (a mistyped provider must not silently start another one).
- `mode: "token"` without `hostname`, or without a token (here or in
  `TUNNEL_TOKEN`), is a config error.
- `opentunnel` set while `provider` is not `"opentunnel"` is a config error
  the same way: a provider's options live in its own section
  (`opentunnel: { route, api }`), never at the top, so a config never
  carries a key the chosen provider would ignore. _Amended during
  implementation:_ `route` and `api` were top-level keys with a rule pinning
  `route` to `"@"` for cloudflared; the section makes both unnecessary.
- The token never reaches the profile record, the logs or the banner, and it
  is passed to the child through its environment, never `argv`.

### CLI

`--provider cloudflared`, `--cloudflared-mode quick|token`,
`--cloudflared-hostname <host>`, `--cloudflared-protocol http2|quic`,
`--cloudflared-binary <name-or-path>`. No flag for the token: `argv` is
visible to every process on the machine; `TUNNEL_TOKEN` is the way.

### Vite plugin

`cloudflared?: { mode, hostname, token, protocol, binary }` — the same keys,
the same rules. The keep-alive hold and the exit guard apply unchanged: they
live in the core and in the plugin.

### Errors (`TunnelError`, kind in brackets)

| Code                     | Kind    | When                                                                          |
| ------------------------ | ------- | ----------------------------------------------------------------------------- |
| `E_CLOUDFLARED_MISSING`  | config  | nothing on `PATH`; the message carries install hints (brew, apt repo, winget) |
| `E_CLOUDFLARED_VERSION`  | config  | `--version` failed or its output does not parse                               |
| `E_CLOUDFLARED_TOKEN`    | config  | token mode without a token                                                    |
| `E_CLOUDFLARED_HOSTNAME` | config  | token mode without a hostname                                                 |
| `E_CLOUDFLARED_URL`      | network | quick mode printed no URL within 20 s                                         |
| `E_CLOUDFLARED_EXITED`   | network | the process exited and the respawn budget is spent                            |

## How it works

### Binary

Look the command up in the injected `PATH` (an absolute path is taken as
is), check it is executable, run `--version` once and parse
`cloudflared version <semver> (built …)`. Cloudflare supports releases for
one year: a version older than that warns and still runs.

### Starting

```
quick:  cloudflared tunnel --no-autoupdate --loglevel info --protocol <p> \
          --url http://<host>:<port> --http-host-header localhost:<port>
token:  cloudflared tunnel --no-autoupdate --loglevel info --protocol <p> run
        (env TUNNEL_TOKEN=<token>)
```

- **The Host header.** Quick mode lets cloudflared rewrite it
  (`localhost:<port>`), which is what Vite's `allowedHosts` check wants — no
  plugin option and no proxy needed. Token mode depends on the dashboard's
  setting. _Amended during implementation:_ an earlier draft had the
  core's proxy cover token mode as a safety net — it cannot, because the
  dashboard's origin URL decides where traffic goes and it never passes a
  proxy the core could start. The provider declares the case through
  `TunnelProvider.hostHeaderPolicy` (`"provider"` / `"proxy"` /
  `"unhandled"`); for token mode the core starts no proxy and warns.
- **Announce only what works.** `connect()` resolves once, in order: the URL
  is known (parsed from stderr in quick mode, configured in token mode), a
  `Registered tunnel connection` line was seen, and a plain `GET` of the
  public URL returned `200`. The probe starts no earlier than 2 s after the
  URL line and retries with backoff for at most 60 s; past that the tunnel is
  announced anyway and the handle carries a `notice` ("Cloudflare may still
  be routing this hostname; retry in a minute"). The probe never runs before
  the bridge is registered — a request that arrives first would be answered
  `530` and proves nothing.
- **Events.** Log lines map onto the existing union: `Registered` →
  `connected` (first) / `reconnected`, `Serve tunnel error` + `Retrying` →
  `disconnected` + `reconnecting`, `Unregistered` → `disconnected`, graceful
  shutdown → `stopped`. One event is new: `{ type: "url-changed", url }`.

### Staying up

cloudflared reconnects to the edge by itself; the supervisor only reacts to
the process dying. It respawns with a 1-2-4-8-16 s backoff, five times, then
rejects `closed` with `E_CLOUDFLARED_EXITED`. A respawn in quick mode mints a
new hostname: the supervisor runs the readiness gate again and emits
`url-changed`, and the CLI and the plugin print a fresh banner. The health
watchdog of `opentunnel` applies unchanged: a failed probe through the public
URL while the target answers directly counts against the bridge.

### Stopping

SIGTERM, wait at most 3 s, SIGKILL. This is the bounded-teardown invariant
with a sharper reason than usual: on a dead control stream cloudflared burns
a core for its whole 30 s grace period.

### Core changes

- `TunnelProvider.handlesHostHeader?: boolean` — see above.
- `TunnelEvent` gains `{ type: "url-changed"; url: string }`; the union stays
  additive, unknown types are ignored by renderers.
- `TunnelProviderConnection` and `TunnelHandle` gain an optional `notice`.
- Profile records gain `provider` (`"opentunnel"` is implied for existing
  files). A profile that belongs to another provider is a config error:
  `E_PROVIDER_MISMATCH`, with the hint to `reset` or to pick another
  `--profile`. Without it a cloudflared run would merge its `hostname` into
  an opentunnel identity and corrupt it. _Amended during implementation:_
  only a run that WRITES a record is held to this — a Quick Tunnel writes
  none and runs under any profile. As first written the check refused
  `--provider cloudflared` on every project that had an opentunnel
  identity, and the hint's way out was `reset`: exactly what it was
  meant to protect got deleted. The hint now offers another profile
  first and says what `reset` costs.
- Quick tunnels write no record: there is nothing stable to store. Token
  mode stores `provider`, `mode`, `hostname` and the usual target fields;
  `reset` then forgets the record and says that the tunnel itself lives in
  the Cloudflare account.

## Testing

The provider never talks to Cloudflare in tests. `src/test-utils.ts` writes a
small Node script into a temp dir and puts it first on the injected `PATH`;
driven by environment variables it prints the real log lines on a schedule,
dumps its `argv` to a file, can exit early and can ignore SIGTERM. Covered:

- binary lookup, missing binary, version parsing;
- the exact `argv` per mode, and that the token is in the environment only;
- URL parsing from stderr; `connected` / `reconnecting` / `stopped` mapping;
- the readiness gate: `200` → announced; warm-up cap → announced with a
  notice; no probe before `Registered`;
- respawn and `url-changed`; the respawn budget ending in `E_CLOUDFLARED_EXITED`;
- teardown bounded when the child ignores SIGTERM.

A live check stays a manual step, on a network where Cloudflare is
reachable: start a Quick Tunnel against `vite preview`, wait for the banner,
open the URL, confirm HTTP/2 in DevTools, stop with Ctrl+C.

## Documented limitations, not solved

- **Quick Tunnels are one-time URLs with a warm-up and Cloudflare's limits.**
  The CLI prints that once per run in yellow.

## Rollout — one commit per step

1. This design.
2. Config surface (`9024a2d`).
3. Binary lookup and version check, with the shared provider pieces
   extracted from opentunnel (`69890cf`).
4.  -   5. The provider, quick and token modes together (`1356411`).
5. Core wiring and CLI (`1c5d23d`) — `hostHeaderPolicy` instead of
   `handlesHostHeader`, and no `notice` field: warnings travel through
   `onWarning`, transient like `onProgress`.
6. Plugin options, docs, changeset.

## Open at the time of writing

- `--http-host-header` is taken from Cloudflare's documentation and several
  guides; the live runs never got a request through to the test origin, so
  the header the origin sees is still to be confirmed in step 4.
- Whether the readiness probe should pin the zone apex's address instead of
  resolving the new name (it avoids the NXDOMAIN cache, but one such probe
  answered `530` while a plain one answered `200` in the same second — most
  likely warm-up noise, not the pinning).
