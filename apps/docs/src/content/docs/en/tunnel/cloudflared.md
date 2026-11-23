---
title: "Cloudflare Tunnel: a quick URL and a stable domain"
description: "The package's second provider, with a one-time URL without an account or a stable domain through a token from the Cloudflare dashboard."
sidebar:
    order: 1
    label: "Cloudflare Tunnel"
---

`cloudflared` works at the HTTP level. TLS ends at Cloudflare's edge, the browser speaks HTTP/2, and the first request needs no handshake across a relay.. From one and the same machine, the first request took 0.79 s through `opentunnel` and from 0.28 to 0.35 s through `cloudflared`.

It needs the [`cloudflared` binary](https://developers.cloudflare.com/tunnel/downloads/) on your `PATH`. The package never downloads it.

## Quick: a URL without an account

```sh
vkma-tunnel --provider cloudflared
# or in vite.config.ts: vkmaTunnel({ provider: "cloudflared" })
```

- The address is one-time, of the form `https://<random-name>.trycloudflare.com`, and it changes on every start. It suits opening the app from a phone. It does not suit the VK app settings.
- The address may not answer for up to a minute. The package does not print it until it answers. If a minute has passed, the package prints the address without a check.
- The package stores nothing. Your `opentunnel` profile and identity are left alone.
- [Cloudflare limits Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/): 200 in-flight requests, and the rest get a `429`; Server-Sent Events do not work; there is no uptime guarantee.
- Anyone who has the link gets in.

## Token: a stable domain

Create a named tunnel in the [Cloudflare dashboard](https://one.dash.cloudflare.com/). Add a public hostname on your own domain and point it at `http://localhost:<port>`. Pass the token through an environment variable only.

```sh
export TUNNEL_TOKEN=… # the dashboard's token, keep it out of argv and out of files
vkma-tunnel --provider cloudflared --cloudflared-mode token --cloudflared-hostname app.example.com
```

```ts
// vite.config.ts
vkmaTunnel({
    provider: "cloudflared",
    cloudflared: { mode: "token", hostname: "app.example.com" },
});
```

The package also reads the `cloudflared.token` config key. But `vite.config.ts` usually ends up in a repository, so keep the token in `TUNNEL_TOKEN`.

What to keep in mind in token mode:

- The dashboard sets the `Host` header. The dashboard decides where the traffic goes, so the package cannot rewrite `Host`. Open the tunnel's settings, the _Additional application settings → HTTP_ section, and set `Host header` to `localhost:<port>`. Vite's `allowedHosts` accepts that `Host`. Or add the hostname to `server.allowedHosts`. When the package cannot rewrite `Host`, it prints a warning.
- A profile belongs to one provider. The modes that store a record, opentunnel and token, refuse to run under another provider's profile. Pick another `--profile`. Quick mode stores nothing and runs under any profile.
- The default transport is `http2`. Where UDP 7844 is blocked, `quic` registers and then dies every few seconds. You can enable it only explicitly, with `cloudflared: { protocol: "quic" }`.

## The Host header

In quick mode `cloudflared` rewrites `Host` to `localhost:<port>` itself. Vite's `allowedHosts` check passes without changes to your config, and HMR works.

If your server needs the real public `Host`, turn the rewrite off with `hostRewrite: false` (`--no-host-rewrite` in the CLI) and allow the suffix. The hostname is new every time, so a single hostname in `allowedHosts` will not help:

```ts
// vite.config.ts
export default {
    server: { allowedHosts: [".trycloudflare.com"] },
};
```

Without that rule Vite answers `403 Blocked request`. With it the page and HMR open.

## Next

- [Overview](/en/tunnel/), the plugin, the CLI, the profile and the stable URL.
