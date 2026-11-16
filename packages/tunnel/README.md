# @vkma.dev/tunnel

Public HTTPS tunnels for local VK Mini App servers — open your dev build on a
phone (or any device) without deploying. Ships a CLI (`vkma-tunnel`), a Node
API and a Vite plugin, all backed by [opentunnel](https://opentunnel.xyz)
(blind TLS tunnels: the key never leaves your machine, HTTPS is automatic).

The public URL is **stable across runs**: the tunnel identity persists per
profile (default: your project directory name), so an URL wired into the VK
app settings keeps working. `vkma-tunnel reset` rotates it.

## CLI

```sh
pnpm add -D @vkma.dev/tunnel

# expose http://127.0.0.1:5173 (Vite's default):
vkma-tunnel

# custom port/host, subdomain route, QR for the phone:
vkma-tunnel --port 3000 --host 127.0.0.1 --route mobile --qr
```

| command                                      | what it does                                             |
| -------------------------------------------- | -------------------------------------------------------- |
| `vkma-tunnel [run] [flags]`                  | start the tunnel, print its URL (Ctrl+C stops)           |
| `vkma-tunnel reset [--profile name] [--all]` | drop stored identities; next runs mint fresh URLs        |
| `vkma-tunnel list [--json]`                  | stored profiles, URLs, targets                           |
| `vkma-tunnel status [profile] [--json]`      | stored identity + live probes (local target, public URL) |

Flags: `--provider`, `--port`, `--host`, `--route`, `--profile`, `--api`,
`--config`, `--qr`, `--open`, `--no-keepalive`, `--json` (NDJSON lifecycle
events for `run` too), `--quiet`, `--no-color`.

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
starts the tunnel and prints its URL next to Vite's own. It also registers the
tunnel hostname in `server.allowedHosts` / `preview.allowedHosts` — without
that Vite answers tunneled requests with 403. HMR works through the tunnel
(the bridge forwards bytes, WebSocket included).

Options (all optional, each overrides `vkma-tunnel.config.ts`): `enabled`,
`config`, `provider`, `port`, `host`, `route`, `profile`, `api`, `qr`, `open`.

A fatal tunnel failure never kills the dev server — you get a red line, the
app keeps running.

## Node API

```ts
import { createTunnel } from "@vkma.dev/tunnel";

const tunnel = await createTunnel({ port: 5173 });
console.log(tunnel.primaryUrl); // https://<id>.opentunnel.xyz

for await (const event of tunnel.events) {
    if (event.type === "reconnecting") console.warn("tunnel reconnecting…");
}

await tunnel.closed; // resolves on close(), rejects on a fatal error
```

`createTunnel(options)` resolves once the tunnel is live. `options`:
`provider` (`"opentunnel"`), `port`, `host` (`"127.0.0.1"`), `route` (`"@"`
apex or a subdomain label), `profile`, `api` (self-hosted server), `dataDir`,
`cwd`, `signal`, `onEvent`.

## Config file

`vkma-tunnel.config.{ts,mts,js,mjs,json}` (discovered walking up from cwd,
first file wins). Layering: CLI flags / plugin options > config file >
defaults.

```ts
import { defineTunnelConfig } from "@vkma.dev/tunnel";

export default defineTunnelConfig({
    provider: "opentunnel", // default, the only provider in v0.1
    port: 5173, // default
    host: "127.0.0.1", // default
    route: "@", // default: apex URL https://<id>.opentunnel.xyz
    // profile: "my-app", // default: project directory name
    // api: "https://opentunnel.example", // self-hosted; OPENTUNNEL_API works too
});
```

Editor autocomplete: add `"$schema": "https://unpkg.com/@vkma.dev/tunnel/schema/vkma-tunnel.config.schema.json"` (shipped as `@vkma.dev/tunnel/schema`).

## Where things live

- Identities: `$XDG_DATA_HOME/vkma/tunnel/<profile>.json` (0600) — delete or
  `reset` to rotate a URL.
- Self-hosting: run your own opentunnel server and point `api` (or
  `OPENTUNNEL_API`) at it.

## Notes

- A tunnel URL is public: anyone holding it reaches your dev server. There is
  no auth in opentunnel — rotate with `reset` if a URL leaks.
- **Bridge stability**: a silently half-dead network path (NAT, flaky Wi-Fi,
  the service itself) drops the bridge WebSocket without a close frame; the
  client then sees `bridge idle timeout` and must take its own route back
  from the server-side ghost (`route held by another bridge (@), taking
  over…`) — that loop self-heals, wait it out. To keep idle bridges from
  being dropped at all, the CLI/plugin send a small self-probe through the
  tunnel every ~20 s (disable with `--no-keepalive` / `keepAlive: false`).
- Ctrl+C (and SIGTERM) always stop the process within seconds, even when the
  SDK teardown hangs on a dead bridge; a hard `kill -9` is never needed.
- Node >= 22.18.
