# @vkma.dev/tunnel

`@vkma.dev/tunnel` gives a local VK Mini App server a public HTTPS address. You can open a dev build on a phone or on any other device without deploying it. The package ships a CLI (`vkma-tunnel`), a Node API and a Vite plugin, and it works with two providers:

- [opentunnel](https://opentunnel.xyz) is the default. It forwards TLS without reading it, so the key never leaves your machine and HTTPS needs no setup.
- [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) (`cloudflared`) needs the `cloudflared` binary. TLS ends at Cloudflare's edge, so the browser speaks HTTP/2 and handshakes are fast.

With opentunnel the public URL is stable across runs. The package stores the tunnel identity per profile, by default under the project directory's name, so a URL wired into the VK app settings keeps working. `vkma-tunnel reset` deletes the identity. The old URL then stops working, and the next run creates a new one.

## CLI

```sh
pnpm add -D @vkma.dev/tunnel

# expose http://localhost:5173 (Vite's default):
vkma-tunnel

# custom port and host, a subdomain route, a QR code for the phone:
vkma-tunnel --port 3000 --host 127.0.0.1 --opentunnel-route mobile --qr
```

| Command                                      | What it does                                              |
| -------------------------------------------- | --------------------------------------------------------- |
| `vkma-tunnel [run] [flags]`                  | start the tunnel, print its URL; Ctrl+C stops it          |
| `vkma-tunnel reset [--profile name] [--all]` | drop stored identities; their URLs stop working           |
| `vkma-tunnel list [--json]`                  | stored profiles, URLs, targets                            |
| `vkma-tunnel status [profile] [--json]`      | stored identity and live probes of the target and the URL |

Flags: `--provider`, `--port`, `--host`, `--profile`, `--config`, `--qr`, `--open`, `--no-keepalive`, `--no-host-rewrite`, `--json` (NDJSON lifecycle events for `run` too), `--quiet`, `--no-color`. A provider's own flags carry its prefix and fill its config section: `--opentunnel-route`, `--opentunnel-api`, `--cloudflared-mode`, `--cloudflared-hostname`, `--cloudflared-protocol`, `--cloudflared-binary`.

## Vite plugin

```ts
// vite.config.ts
import { vkmaTunnel } from "@vkma.dev/tunnel/vite";

export default {
    plugins: [vkmaTunnel()],
};
```

The plugin needs no options. It reads the port the dev server actually listens on, starts the tunnel and prints the URL next to Vite's own. It does the same for `vite preview`, so you can open a production build on a phone without deploying.

Vite checks the `Host` header of every request against `allowedHosts`. The package routes requests through a loopback proxy that rewrites the header (see below), so your Vite config needs no change. Vite copies `allowedHosts` when the server starts and ignores later edits.

With `hostRewrite: false` (see below) Vite has to know the tunnel's hostname before the server starts. If the profile's identity already exists, the plugin adds the hostname to `server.allowedHosts` and `preview.allowedHosts` while the config is still loading. A new profile gets its hostname only after the server has started. It then needs one restart, and the plugin says so.

HMR works through the tunnel.

Options (all optional): `enabled`, `config`, `provider`, `profile`, `qr`, `open`, `keepAlive`, `hostRewrite`, and a provider's section, `opentunnel` or `cloudflared`, with the keys it has in the config file. Each option overrides the matching key of `vkma-tunnel.config.*`. `port` and `host` point the tunnel at another server. The plugin always tunnels the server it is attached to. It treats the Vite root as the project, so config discovery and the default profile start there.

A tunnel that fails never stops the dev server. You get a red line, and the app keeps running.

Stopping Vite closes the tunnel first. This holds for Ctrl+C, `q`, a closed terminal and SIGTERM. The service then releases the route at once. Otherwise it would keep the route for a session that no longer exists, and the next start would fail with `route_conflict` until it took the route over.

While a tunnel is live, the plugin raises the server's keep-alive timeout to two minutes. Node's default is five seconds, and Vite leaves it alone. The plugin restores the value when the tunnel closes. Through a tunnel every new connection costs a TLS handshake across the whole relay path, and a short pause in browsing should not cost one.

## CLI with Vite's own dev or preview server

Vite's DNS-rebinding protection rejects any request whose `Host` header is not `localhost`. A tunnel would get "Blocked request" without further setup. The package therefore puts a small loopback proxy in front of your server, in the CLI and in the plugin. The proxy rewrites the tunnel hostname into a `*.localhost` alias of the same byte length, for example `m3f2vu5sb237.opentunnel.xyz` into `m3f2vu5sb237.open.localhost`. Vite always allows `*.localhost`. Because the length stays the same, the proxy rewrites `Host`, `Origin` and `Referer` by replacing bytes, and WebSocket upgrades pass through unchanged. Your Vite config needs no change.

Turn the proxy off with `--no-host-rewrite` or `hostRewrite: false`. Do it when the target serves its own TLS or routes on the public `Host`.

The proxy forwards to `localhost` by default. On modern Node, `localhost` resolves to `::1` or `127.0.0.1`. `vite preview` often listens on IPv6 loopback only, where `127.0.0.1` would be refused.

## Cloudflare Tunnel (`cloudflared`)

`cloudflared` is an HTTP-level tunnel. TLS ends at Cloudflare's edge, the browser speaks HTTP/2, and a request costs one trip from the edge to your machine. With opentunnel every request also pays for a TLS handshake across a relay. The provider needs the [`cloudflared` binary on your PATH](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/). The package never downloads it.

### Quick mode

Quick mode needs no account:

```sh
vkma-tunnel --provider cloudflared
```

The URL is a one-time `*.trycloudflare.com` address. It changes on every start and takes up to a minute to warm up. The package waits until the address answers, for at most a minute. Past that it prints the address without a check. The package stores nothing for a Quick Tunnel. It suits a look from another device and does not suit the VK app settings. Cloudflare limits Quick Tunnels to 200 in-flight requests and does not support Server-Sent Events. There is no uptime guarantee.

By default `cloudflared` rewrites the `Host` header to `localhost:<port>`, so Vite's `allowedHosts` check passes. With `hostRewrite: false` (`--no-host-rewrite` in the CLI) the public `*.trycloudflare.com` `Host` reaches your server. Then allow the suffix in Vite, `server.allowedHosts: ['.trycloudflare.com']`, because the name is new on every start.

### Token mode

Token mode gives you a stable hostname. Create a named tunnel in the [Cloudflare dashboard](https://one.dash.cloudflare.com/), add its public hostname there, and point the tunnel at `http://localhost:<port>`:

```sh
export TUNNEL_TOKEN=… # the dashboard's token; never put it in argv or in a file
vkma-tunnel --provider cloudflared --cloudflared-mode token --cloudflared-hostname app.example.com
```

or in the config:

```ts
export default defineTunnelConfig({
    provider: "cloudflared",
    cloudflared: { mode: "token", hostname: "app.example.com" },
});
```

In token mode:

- The dashboard sets the `Host` header. The dashboard decides where the traffic goes, so the package cannot rewrite `Host` for you. In the tunnel's settings, under _Additional application settings_, open _HTTP_ and set `Host header` to `localhost:<port>`. That is the value Vite's `allowedHosts` expects. Or add the hostname to Vite's `server.allowedHosts`. The package warns when it cannot help.
- A profile belongs to one provider. A tunnel that stores a record (opentunnel, cloudflared token mode) refuses a profile another provider owns. Pick another `--profile`. A Quick Tunnel stores nothing, so it runs under any profile and leaves the stored identity alone.

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

`createTunnel(options)` resolves once the tunnel is live. `options` takes `provider` (`"opentunnel"` or `"cloudflared"`), `port`, `host` (`"localhost"`), `profile`, a provider's section, `dataDir`, `cwd`, `signal`, `onEvent`, `onProgress`, `onWarning`, `keepAlive`, `hostRewrite` and `pid`. The `opentunnel` section has `route` (`"@"` for the apex, or a subdomain label) and `api` (a self-hosted server). The handle's `hostname`, `urls` and `primaryUrl` follow the provider. A `url-changed` event means that the provider replaced the URL under the same handle.

## Config file

The package discovers `vkma-tunnel.config.{ts,mts,js,mjs,json}` by walking up from the current directory. The first file it finds wins. CLI flags and plugin options override the file, and the file overrides the defaults. `port` and `host` in the file apply to the CLI and the Node API. The plugin tunnels the live Vite server unless its own `port` or `host` option says otherwise.

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

The top level holds the keys that every provider understands. Everything else belongs in the chosen provider's section. A config therefore never carries a key that the provider would silently ignore. A section next to another provider's id is a config error.

For editor autocomplete, add `"$schema": "https://unpkg.com/@vkma.dev/tunnel/schema/vkma-tunnel.config.schema.json"` to a JSON config. The package ships the schema as `@vkma.dev/tunnel/schema`.

## Where things live

- The package stores identities in `$XDG_DATA_HOME/vkma/tunnel/<profile>.json` with mode `0600`. Delete the file or run `reset` to drop one. The old URL then stops working, and the next run creates a new one.
- To self-host, run your own opentunnel server and point `opentunnel.api` (or `OPENTUNNEL_API`) at it.

## Notes

- A tunnel URL is public. Anyone who has it reaches your dev server. opentunnel has no authentication. If a URL leaks, run `reset`.
- A network path can fail halfway (NAT, flaky Wi-Fi, a problem on the service side). The bridge WebSocket then drops without a close frame. The client reports `bridge idle timeout` and has to take its route back from the service, which still holds it for the closed session (`route held by another bridge (@), taking over…`). This loop recovers by itself, so wait it out. The line below the message names the process that holds the route, or says that it is already gone. To stop idle bridges from being dropped, the CLI and the plugin send a small self-probe through the tunnel every 20 seconds. Turn it off with `--no-keepalive` or `keepAlive: false`.
- Ctrl+C and SIGTERM always stop the process within a few seconds, even when the SDK hangs while closing a dead bridge. You never need `kill -9`.
- With opentunnel, TLS ends on your machine and not at the service's edge. In DevTools, `Initial connection` is one round trip to the edge. `SSL` and every request after it are a full round trip from the edge through the relay to your machine. A visitor on the same network as the machine pays that trip twice. A long path therefore costs hundreds of milliseconds per phase, and that is how the provider works. A far uplink or a VPN on either side adds to every round trip. The tunnel speaks HTTP/1.1 only, so a page load opens several connections, and each one needs its own handshake. The `cloudflared` provider exists for this case.
- With `cloudflared` the transport is `http2` by default. Where UDP 7844 is blocked, `quic` registers and then dies every few seconds without falling back. To opt in, set `cloudflared: { protocol: "quic" }`.
- Node >= 22.18.
