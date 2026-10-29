# @vkma.dev/devtools

## 0.2.0

### Minor Changes

- da6d594: fabPosition option: initial FAB placement (bottom-left / bottom / bottom-right)
- 603a33f: Ignored events: hide factory noise (ScrollTop, UpdateInsets, SetSupportedHandlers, …) out of the timeline — eye toggle, popover editor, per-row ignore
- 686c201: Extract shared wire types and the client palette into @vkma.dev/protocol and add a ./store subpath export for the extension

### Patch Changes

- e12316e: Exec timeout 20s → 60s (store guard; panel call timeouts follow at 70s)
- a7e2cbe: Execute autocomplete over the bridge catalogue (Base UI Autocomplete) with params stub prefill
- ba8667b: Flat MCP input schema for `vkma:mcp-execute` (plain agent tool, no `arg0` wrapping).
- 6f3a42d: Owner-bound exec settlement, ring byte budget, insert-time registry cap, loop pushes
- Updated dependencies [d6d6398]
- Updated dependencies [631947f]
    - @vkma.dev/bridge@0.2.1

## 0.1.0

### Minor Changes

- a19cfee: feat(devtools): MCP tools (`vkma:mcp-state`, `vkma:mcp-execute`) at `/__vkma/__mcp` for coding agents
- 17e99e0: feat(devtools): Rsbuild adapter (`@vkma.dev/devtools/rsbuild`) — panel on a side-car WS, issuer-aware bridge interception, FAB/collector injection
- bc4778b: feat(devtools): the timeline rides devframe streaming channels — evergreen `live` stream with a 500-chunk replay window (no more snapshot race), lazily-seeded per-client streams for embedded panels
- 2b3d14b: feat(devtools): `hub: true` mounts the panel as a Vite DevTools dock (shared WS/auth, MCP tools aggregate into the hub endpoint)

### Patch Changes

- 143a1f2: fix(devtools): close the panel RPC client on cleanup (reconnect leaked a WebSocket) and surface connection/rpc errors in the status gate
- 0e07fdf: fix(devtools): MCP route off by default — opt in with the `mcp` plugin flag (Vite and Rsbuild adapters)
- 3500684: fix(devtools): GET `/__vkma/__mcp` opened the panel HTML instead of the MCP route — the static SPA fallback ate the bridge's extensionless reserved routes
- ebc4b4c: fix(devtools): make the `vite`/`@devframes/vite` peers optional — Rsbuild consumers no longer need Vite installed
- Updated dependencies [3bddd55]
    - @vkma.dev/bridge@0.2.0
