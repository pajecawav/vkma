---
title: "@vkma.dev/tunnel — public HTTPS tunnels to a local server"
description: "A public HTTPS address for a local dev server, to open a build on a phone without deploying."
sidebar:
    order: 0
    label: "Overview"
---

`@vkma.dev/tunnel` gives a local dev server a public HTTPS address. You can open your build on a phone or hand the link to a colleague, and nothing gets deployed. The package has three entry points: a Vite plugin, the `vkma-tunnel` CLI and a Node API. It has two providers:

| Provider               | URL                                                          | What it needs                                                          |
| ---------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `opentunnel` (default) | stable, `https://<id>.opentunnel.xyz`                        | nothing: no account, the key stays on your machine                     |
| `cloudflared`          | one-time `*.trycloudflare.com`, or stable on your own domain | the `cloudflared` binary, plus a Cloudflare account for the stable one |

## Quick start

The Vite plugin takes no options:

```ts
// vite.config.ts
import { vkmaTunnel } from "@vkma.dev/tunnel/vite";

export default {
    plugins: [vkmaTunnel()],
};
```

```sh
npm install -D @vkma.dev/tunnel
# or: pnpm add -D / yarn add -D / bun add -D
npm run dev
```

The plugin reads the dev server's actual listening port, starts the tunnel and prints its URL next to Vite's own lines:

```text
  ➜  Local:   http://localhost:5173/
  ➜  tunnel  →  https://4bznf5jcbkct.opentunnel.xyz  (profile my-app · localhost:5173)
```

The plugin works the same with `vite preview`. You can open a production build on a phone without deploying it.

Requests reach Vite without changes to your config. The package rewrites the `Host` header to an address Vite always accepts. HMR works through the tunnel. If the tunnel dies, the dev server keeps running and a red line appears in the terminal.

Options (all optional): `enabled`, `config`, `provider`, `profile`, `qr`, `open`, `keepAlive`, `hostRewrite`, and a provider's section, `opentunnel` or `cloudflared`, with the keys it has in the config file. The plugin tunnels the server it is attached to.

## CLI

```sh
npx @vkma.dev/tunnel                        # expose http://localhost:5173
npx @vkma.dev/tunnel --provider cloudflared # a one-time URL, no account
```

| Command                                      | What it does                                                               |
| -------------------------------------------- | -------------------------------------------------------------------------- |
| `vkma-tunnel [run] [flags]`                  | starts the tunnel and prints its URL, Ctrl+C stops it                      |
| `vkma-tunnel reset [--profile name] [--all]` | deletes stored identities, and their URLs stop working                     |
| `vkma-tunnel list [--json]`                  | shows stored profiles, their URLs and targets                              |
| `vkma-tunnel status [profile] [--json]`      | shows the stored identity and the result of probing the target and the URL |

Flags: `--provider`, `--port`, `--host`, `--profile`, `--config`, `--qr`, `--open`, `--no-keepalive`, `--no-host-rewrite`, `--json`, `--quiet`, `--no-color`. A provider's flags carry its prefix: `--opentunnel-route`, `--opentunnel-api`, `--cloudflared-mode`, `--cloudflared-hostname`, `--cloudflared-protocol`, `--cloudflared-binary`.

## Profile and the stable URL

With `opentunnel` the address does not change between runs. The package stores the identity per profile, by default the project directory's name. A directory name without Latin letters or digits becomes `project-<hash>`, so two such projects do not share an address. A URL wired into the VK app settings therefore keeps working. On the first run the package waits for the certificate to be issued. On the hosted service this can take several minutes.

```sh
vkma-tunnel --profile my-app        # another profile, another address
vkma-tunnel list                    # what is stored
vkma-tunnel reset --profile my-app  # delete the identity
```

After `reset` the old URL stops working, and the next run issues a new one.

## Config

The package looks for `vkma-tunnel.config.{ts,mts,js,mjs,json}`, walking up from the current directory. The priority is: CLI flags and plugin options, then the file, then the defaults.

```ts
// vkma-tunnel.config.ts
import { defineTunnelConfig } from "@vkma.dev/tunnel";

export default defineTunnelConfig({
    provider: "opentunnel", // default; or "cloudflared"
    port: 5173, // default
    host: "localhost", // default
    // profile: "my-app", // default: project directory name
    // A provider's own options live in its section, never at the top:
    // opentunnel: {
    //     route: "@", // default https://<id>.opentunnel.xyz, or a subdomain label
    //     api: "https://opentunnel.example", // self-hosted server
    // },
});
```

The top level holds only the keys every provider understands: `provider`, `port`, `host`, `profile`. A section beside another provider is a config error. The package rejects a key the provider would ignore. `port` and `host` from the file apply to the CLI and the Node API. The plugin tunnels the live Vite server.

## Node API

```ts
import { createTunnel } from "@vkma.dev/tunnel";

const tunnel = await createTunnel({ port: 5173 });
console.log(tunnel.primaryUrl); // https://<id>.opentunnel.xyz

await tunnel.close();
```

`createTunnel(options)` resolves once the tunnel is up. Besides the config fields, options takes `signal`, `onEvent`, `onProgress`, `onWarning`, `keepAlive` and `hostRewrite`. The handle's `hostname`, `urls` and `primaryUrl` follow the provider. A `url-changed` event means the URL changed under the same handle.

## Worth knowing

- The URL is public. Anyone who has the link reaches your dev server. `opentunnel` and the Cloudflare Quick Tunnel have no authentication. If a URL leaks, run `reset`.
- Stopping Vite closes the tunnel. This happens on Ctrl+C, on `q` and on SIGTERM. The service releases the route at once. Without it the next run would hit a `route_conflict` error.
- Vite answers "Blocked request" to a foreign `Host` header. By default the package rewrites the header for you. Turn the rewrite off only if your server needs the real public `Host`. Then pass `hostRewrite: false` (`--no-host-rewrite` in the CLI) and add the address to `server.allowedHosts`.

## Next

- [Cloudflare Tunnel](/en/tunnel/cloudflared/), quick and token modes, the Host header in the dashboard.

## Links

- [npm: @vkma.dev/tunnel](https://www.npmjs.com/package/@vkma.dev/tunnel)
