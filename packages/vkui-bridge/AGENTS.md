# AGENTS.md — packages/vkui-bridge

React glue between `@vkma.dev/bridge` and `@vkontakte/vkui`: host-driven
appearance / insets / adaptivity hooks, their pure resolvers, and a
preassembled `VKBridgeConfigProvider` (`ConfigProvider` →
`AdaptivityProvider` → `AppRoot`). Keep all comments, commits, and docs
in English.

## Commands

- `pnpm build` — tsdown (ESM-only, **unbundled**: dist mirrors src 1:1
  with declaration/source maps; `src/` ships in the tarball so IDE
  go-to-source lands on real sources), single entry `src/index.ts`
- `pnpm test` — vitest, **happy-dom** environment, co-located
  `*.test.ts(x)`
- `pnpm lint:package` — publint

## Architecture map

- `src/config.ts` — `BridgeConfigData` (the overlap of the config-shaped
  payloads: `VKWebAppUpdateConfig`, `VKWebAppGetConfig` result,
  `VKWebAppUpdateInsets`) plus the pure resolvers
  (`resolveAppearance`/`resolveAdaptivity`/`resolveInsets`). No react and
  no vkui beyond types.
- `src/transform.ts` — `transformVKBridgeAdaptivity`: bridge vocabulary →
  `AdaptivityProvider` props (this file may touch vkui values, hence it
  is separate from `config.ts`).
- `src/hooks.ts` — `useBridgeAppearance` / `useBridgeInsets` /
  `useBridgeAdaptivity` around the **default bridge singleton**.
- `src/provider.tsx` — `VKBridgeConfigProvider`: every `ConfigProvider`
  prop is a bridge-computed default, app-provided props spread LAST and
  win.
- `src/index.ts` — the single public entry; everything re-exported there.

## Invariants — do not break

1. **Semantics are 1:1 with `@vkontakte/vk-bridge-react@2.0.1`** — the
   upstream is the source of truth for the hook rules (the tarball is the
   reference). Concretely:
    - the appearance stream considers only events carrying BOTH
      `appearance` and `scheme` keys, and the hook is inert unless
      `bridge.isEmbedded()`;
    - insets arrive from two sources (`VKWebAppUpdateInsets` and
      `VKWebAppUpdateConfig.insets`) and `bottom > 150` is clamped to `0`
      (the value keeps the transient keyboard out of the layout); the
      number is deliberate, upstream-pinned;
    - adaptivity only advances when a config carries both
      `viewport_width` and `viewport_height`.
2. **The hooks read the default bridge singleton** (module-level import
   from `@vkma.dev/bridge`) — parity with upstream, and enough: a mini
   app has one bridge. Tests fake the singleton with `vi.mock` +
   `vi.hoisted` state. A dependency-injected bridge is an explicit user
   decision, not a refactor.
3. **`VKWebAppGetConfig` bootstrap failures surface as `console.error`
   alone** (`.catch(error => console.error(error))`): outside the
   sandbox the request is expected to fail, and the failure stays
   container-internal.
4. **Zero runtime dependencies**, peers only (`bridge ^0.2.0`, `vkui
   ^8.0.0`, `react ^18 || ^19`). Adding one is an explicit user
   decision.
5. Node >= 22 (`engines` is a decision, not a lookup).

## Testing notes

- **The repo-wide convention skips `@testing-library`.** Hook tests
  hand-roll a micro `renderHook` on `createRoot` + `act`, and the act
  environment flag must be set (`IS_REACT_ACT_ENVIRONMENT = true`) or
  React warns.
- The fake bridge lives in `vi.hoisted` state; subscriptions are tracked
  in it, `send` resolves from a per-name map. Every `emit` runs inside
  `act`, and promise-driven paths (the `GetConfig` bootstrap) need an
  `await act(async () => {})` flush — microtasks between statement do
  not run.
- The provider test probes via `useConfigProvider` from vkui (that is
  the context hook name in vkui 8).
- Assert on `#root` content or `useConfigProvider` data. The FAB hides
  the root layout via visibility, so `body.innerText` reads empty even
  with the app mounted.

## Publishing dance (see root AGENTS.md)

The create-app templates pin `@vkma.dev/vkui-bridge` and CI's
scaffold-e2e installs from the registry pins: a template change must be
published before pushing, or CI goes red.
