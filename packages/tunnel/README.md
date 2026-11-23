# @vkma.dev/tunnel

Public HTTPS tunnels for local VK Mini App servers — open your dev build on a
phone (or any device) without deploying. Ships a CLI (`vkma-tunnel`), a Node
API and a Vite plugin over two providers:

- **[opentunnel](https://opentunnel.xyz)** (default) — blind TLS tunnels: the
  key never leaves your machine, HTTPS is automatic.
- **[Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)** (`cloudflared`) — needs the `cloudflared` binary; TLS ends at Cloudflare's edge, so the browser speaks HTTP/2 and handshakes are fast.

With opentunnel the public URL is **stable across runs**: the tunnel identity
persists per profile (default: your project directory name), so an URL wired
into the VK app settings keeps working. `vkma-tunnel reset` drops it: the old URL
stops working and the next run mints a new one.

## CLI

```sh
pnpm add -D @vkma.dev/tunnel

# expose http://localhost:5173 (Vite's default):
vkma-tunnel

# custom port/host, subdomain route, QR for the phone:
vkma-tunnel --port 3000 --host 127.0.0.1 --opentunnel-route mobile --qr
```

| command                                      | what it does                                             |
| -------------------------------------------- | -------------------------------------------------------- |
| `vkma-tunnel [run] [flags]`                  | start the tunnel, print its URL (Ctrl+C stops)           |
| `vkma-tunnel reset [--profile name] [--all]` | drop stored identities; their URLs stop working          |
| `vkma-tunnel list [--json]`                  | stored profiles, URLs, targets                           |
| `vkma-tunnel status [profile] [--json]`      | stored identity + live probes (local target, public URL) |

Flags: `--provider`, `--port`, `--host`, `--profile`, `--config`, `--qr`,
`--open`, `--no-keepalive`, `--no-host-rewrite`, `--json` (NDJSON lifecycle
events for `run` too), `--quiet`, `--no-color`. A provider's own flags carry
its prefix and fill its config section: `--opentunnel-route`,
`--opentunnel-api`, `--cloudflared-mode`, `--cloudflared-hostname`,
`--cloudflared-protocol`, `--cloudflared-binary`.

## Vite plugin

```ts
// vite.config.ts
import { vkmaTunnel } from "@vkma.dev/tunnel/vite";

export default {
    plugins: [vkmaTunnel()],
};
```

Zero options needed: the plugin reads the **actual listening port** of the dev
server (and of `vite preview` — prod builds on a phone without deploying),
starts the tunnel and prints its URL next to Vite's own. Requests reach Vite
because the core routes them through the host-rewriting proxy (see below), so
nothing in your Vite config has to change: Vite snapshots `allowedHosts` when
the server starts and ignores later edits. When the profile's identity already
exists, the plugin also adds its hostname to `server.allowedHosts` /
`preview.allowedHosts` while the config is still resolving — that is what
makes `hostRewrite: false` work; a brand-new profile mints its hostname too
late for it and needs one restart (the plugin says so). HMR works through the
tunnel (the bridge forwards bytes, WebSocket included).

Options (all optional): `enabled`, `config`, `provider`, `profile`, `qr`,
`open`, `keepAlive`, `hostRewrite`, and a provider's section — `opentunnel`,
`cloudflared` — with the keys it has in the config file. Each overrides
`vkma-tunnel.config.*`. `port` and `host` retarget the tunnel away from the
live Vite server; the same keys in the config file apply to the CLI and the
Node API only, the plugin always tunnels the server it is attached to. The
Vite root is the project: config discovery and the default profile start
there.

A fatal tunnel failure never kills the dev server — you get a red line, the
app keeps running.

Stopping Vite closes the tunnel first — Ctrl+C, `q`, a closed terminal and
SIGTERM alike — so the service releases the route at once instead of keeping
it for a ghost session (which is what makes the next start fight through
`route_conflict` takeovers).

While a tunnel is live the plugin raises the server's keep-alive timeout to
two minutes (Node's default is five; Vite leaves it alone) and restores it
when the tunnel closes: through a tunnel every new connection pays a TLS
handshake across the whole relay path, and a short pause in browsing should
not cost one.

## CLI + stock vite dev/preview (no plugin)

Vite's DNS-rebinding protection rejects requests whose `Host` header is not
`localhost` — a tunnel would hit "Blocked request" out of the box. The core
therefore puts a small loopback proxy in front of your server (CLI and plugin
alike) that rewrites the tunnel hostname
into a **same-length `*.localhost` alias** (`m3f2vu5sb237.opentunnel.xyz` →
`m3f2vu5sb237.open.localhost`): `*.localhost` is always allowed, the byte
length is preserved, so Host/Origin/Referer are rewritten by pure byte
substitution and WebSocket upgrades pass through untouched. No vite config
changes needed. Disable with `--no-host-rewrite` / `hostRewrite: false`
(e.g. when the target serves its own TLS or routes on the public Host).

The default forward target is `localhost` (resolves to `::1` or `127.0.0.1` —
`vite preview` on modern Node often binds IPv6 loopback only, where
`127.0.0.1` would refuse).

## Cloudflare Tunnel (`cloudflared`)

An HTTP-level tunnel: TLS ends at Cloudflare's edge, the browser speaks
HTTP/2, and a request costs one edge → your machine trip instead of a TLS
handshake across a relay. It needs the [`cloudflared` binary on your
PATH](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
— this package never downloads it.

**Quick mode** — no account, one command:

```sh
vkma-tunnel --provider cloudflared
```

The URL is a one-time `*.trycloudflare.com` address: it **changes on every
start** and takes up to a minute to warm up (the tool announces it only once
it answers). Nothing is stored for it. Fine for a look from another device;
not for the VK app settings. Cloudflare also limits Quick Tunnels to 200
in-flight requests and no Server-Sent Events, with no uptime guarantee.

The Host header is rewritten to `localhost:<port>` for you, so Vite's
`allowedHosts` check passes. With `hostRewrite: false` (CLI:
`--no-host-rewrite`) the public `*.trycloudflare.com` Host reaches your
server instead — then allow the suffix,
`server.allowedHosts: ['.trycloudflare.com']`, because the name is new on
every start.

**Token mode** — a stable hostname. Create a named tunnel in the [Cloudflare
dashboard](https://one.dash.cloudflare.com/), add its public hostname there,
and point the tunnel at `http://localhost:<port>`:

```sh
export TUNNEL_TOKEN=… # the dashboard's token: never put it in argv or a file
vkma-tunnel --provider cloudflared --cloudflared-mode token --cloudflared-hostname app.example.com
```

or in the config:

```ts
export default defineTunnelConfig({
    provider: "cloudflared",
    cloudflared: { mode: "token", hostname: "app.example.com" },
});
```

Two things to know about token mode:

- **The Host header is the dashboard's to set.** Traffic goes where the
  dashboard sends it, so this package cannot rewrite the Host for you. In
  the tunnel's _Additional application settings → HTTP_ set the **Host
  header** to `localhost:<port>` (what Vite's `allowedHosts` wants), or add
  the hostname to Vite's `server.allowedHosts`. The tool warns when it
  cannot help.
- **A profile belongs to one provider.** A tunnel that stores a record
  (opentunnel, cloudflared token mode) refuses a profile another provider
  owns — pick another `--profile`. A Quick Tunnel stores nothing, so it
  runs under any profile and leaves the stored identity alone.

## Node API

```ts
import { createTunnel } from "@vkma.dev/tunnel";

const tunnel = await createTunnel({ port: 5173 });
console.log(tunnel.primaryUrl); // https://<id>.opentunnel.xyz

for await (const event of tunnel.events) {
    if (event.type === "reconnecting") console.warn("tunnel reconnecting…");
} // ends when the tunnel stops

await tunnel.closed; // resolves on close(), rejects on a fatal error
```

`createTunnel(options)` resolves once the tunnel is live. `options`:
`provider` (`"opentunnel"` or `"cloudflared"`), `port`, `host`
(`"localhost"`), `profile`, a provider's section — `opentunnel` (`route`:
`"@"` apex or a subdomain label; `api`: a self-hosted server) or `cloudflared`
— `dataDir`, `cwd`, `signal`, `onEvent`, `onProgress`, `onWarning`,
`keepAlive`, `hostRewrite`, `pid`. The handle's `hostname`, `urls` and `primaryUrl` follow the
provider: a `url-changed` event means the URL was replaced under the same
handle.

## Config file

`vkma-tunnel.config.{ts,mts,js,mjs,json}` (discovered walking up from cwd,
first file wins). Layering: CLI flags / plugin options > config file >
defaults. `port` and `host` in the file apply to the CLI and the Node API;
the plugin always tunnels the live Vite server unless its own `port`/`host`
options say otherwise.

```ts
import { defineTunnelConfig } from "@vkma.dev/tunnel";

export default defineTunnelConfig({
    provider: "opentunnel", // default; or "cloudflared" (see below)
    port: 5173, // default
    host: "localhost", // default
    // profile: "my-app", // default: project directory name
    // A provider's own options live in its section, never at the top:
    // opentunnel: {
    //     route: "@", // default: apex URL https://<id>.opentunnel.xyz
    //     api: "https://opentunnel.example", // self-hosted; OPENTUNNEL_API works too
    // },
});
```

The top level holds what every provider understands; everything else is the
chosen provider's section, so a config never carries a key that provider
would silently ignore. A section beside another provider's `id` is a config
error, not a dead key.

Editor autocomplete: add `"$schema": "https://unpkg.com/@vkma.dev/tunnel/schema/vkma-tunnel.config.schema.json"` (shipped as `@vkma.dev/tunnel/schema`).

## Where things live

- Identities: `$XDG_DATA_HOME/vkma/tunnel/<profile>.json` (0600) — delete or
  `reset` to drop one: the next run mints a new URL, the old one stops
  working.
- Self-hosting: run your own opentunnel server and point `opentunnel.api` (or
  `OPENTUNNEL_API`) at it.

## Notes

- A tunnel URL is public: anyone holding it reaches your dev server. There is
  no auth in opentunnel — rotate with `reset` if a URL leaks.
- **Bridge stability**: a silently half-dead network path (NAT, flaky Wi-Fi,
  the service itself) drops the bridge WebSocket without a close frame; the
  client then sees `bridge idle timeout` and must take its own route back
  from the server-side ghost (`route held by another bridge (@), taking
  over…`) — that loop self-heals, wait it out; the line right below it names
  the process that holds the route, or says it is already gone. To keep idle bridges from
  being dropped at all, the CLI/plugin send a small self-probe through the
  tunnel every ~20 s (disable with `--no-keepalive` / `keepAlive: false`).
- Ctrl+C (and SIGTERM) always stop the process within seconds, even when the
  SDK teardown hangs on a dead bridge; a hard `kill -9` is never needed.
- **Latency**: opentunnel is a blind TLS tunnel — TLS ends on your machine,
  not at the service's edge. In DevTools `Initial connection` is one round
  trip to the edge, while `SSL` and every request pay a full
  edge → relay → your machine round trip, twice over when the visitor sits
  on the same network as the machine. Hundreds of milliseconds per phase
  when that path is long is the design, not a bug: a far uplink or VPN on
  either side adds to every round trip, and the tunnel speaks plain
  HTTP/1.1, so a page load opens several connections, each with its own
  handshake.
- **cloudflared transport**: `http2` by default. Where UDP 7844 is blocked,
  cloudflared's own default (`quic`) registers and then dies every few
  seconds without falling back; `cloudflared: { protocol: "quic" }` opts in.
- Node >= 22.18.
