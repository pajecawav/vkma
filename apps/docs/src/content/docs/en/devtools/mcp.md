---
title: "MCP"
description: "The vkma:mcp-state and vkma:mcp-execute tools for coding agents at /__vkma/__mcp."
sidebar:
    order: 4
---

The panel can hand its data to coding agents (OpenCode, Claude Code, any MCP client) through an MCP server on your dev server. The route is off by default. Turn it on deliberately:

```ts
vkmaDevtools({ mcp: true }); // or vkmaDevtoolsRsbuild({ mcp: true })
```

The endpoint is Streamable HTTP at `<base>__mcp`, by default `http://localhost:5173/__vkma/__mcp`. The data source is the same one the [panel](/en/devtools/panel/) reads: agents see exactly what you see.

## Trust modes

Enabling `mcp: true` gives you a zero-config setup with two gates:

1. **Origin is required.** A request without an `Origin` header gets 403. With one, it must be loopback (`localhost`, `127.0.0.1`, `::1`). This is DNS-rebinding protection: a non-browser MCP client must send an Origin explicitly.
2. **Loopback peer.** The connection must come from your machine (the address is checked server-side and cannot be forged).

For tunnels and LAN setups widen trust with an object instead of `true`:

```ts
vkmaDevtools({
    mcp: {
        allowedOrigins: ["https://my-tunnel.example"], // also accept this Origin
        authorization: "Bearer <your-token>", // prove who is calling
    },
});
```

- `allowedOrigins` — origins accepted beyond loopback; `false` disables the Origin check entirely (not recommended).
- `authorization` — a bearer token (or a callback), checked after the origin gate: a missing or invalid credential gets 401 with `WWW-Authenticate: Bearer`. An authenticated caller is exempt from the loopback restriction.

The `path` field (default `__mcp`) changes the route segment; `instructions` adds a hint for the agent in `initialize`.

## Connecting an agent

Add the server to your MCP client config with headers; `Authorization` is only needed when a token is set:

```json
{
    "mcpServers": {
        "vkma": {
            "url": "http://localhost:5173/__vkma/__mcp",
            "headers": {
                "Origin": "http://localhost:5173",
                "Authorization": "Bearer <your-token>"
            }
        }
    }
}
```

## Tools

- **`vkma:mcp-state`** (read). Connected clients (platform, URL, online) and the last 500 bridge events, newest last. Payloads are sanitized to plain JSON.
- **`vkma:mcp-execute`** (action). Executes a VK Bridge method on a client and awaits the round-trip result. Input: `{ "clientId": "…", "name": "VKWebAppGetUserInfo", "params": {} }`. `clientId` and `name` are required, ids come from `vkma:mcp-state`. It mutates the running app's state.

The typical flow: the agent reads `vkma:mcp-state`, finds the client it needs, then replays or verifies calls through `vkma:mcp-execute` without opening a browser.

In [hub mode](/en/devtools/vite/#vite-devtools-dock) the endpoint aggregates into `/__devtools/__mcp`, and the `mcp` option is ignored.

## Next

- [The panel](/en/devtools/panel/) — the same data for humans.
- [Vite plugin](/en/devtools/vite/) and [Rsbuild adapter](/en/devtools/rsbuild/) — setup.
