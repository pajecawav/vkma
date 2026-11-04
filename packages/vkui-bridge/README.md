# @vkma.dev/vkui-bridge

[![npm](https://img.shields.io/npm/v/@vkma.dev/vkui-bridge.svg)](https://www.npmjs.com/package/@vkma.dev/vkui-bridge)
[![minzip](https://img.shields.io/bundlephobia/minzip/@vkma.dev/vkui-bridge.svg)](https://bundlephobia.com/package/@vkma.dev/vkui-bridge)

React glue between [`@vkma.dev/bridge`](https://github.com/pajecawav/vkma/tree/master/packages/bridge#readme) and [`@vkontakte/vkui`](https://github.com/VKCOM/VKUI): the host config — appearance, safe-area insets, adaptivity — streamed from bridge events and preassembled into a ready `ConfigProvider` shell. Same role [`@vkontakte/vk-bridge-react`](https://www.npmjs.com/package/@vkontakte/vk-bridge-react) plays next to `vk-bridge`, semantics copied 1:1 from it.

## Install

```sh
npm install @vkma.dev/vkui-bridge
# or: pnpm add / yarn add / bun add
```

Peers: `@vkma.dev/bridge ^0.2.0`, `@vkontakte/vkui ^8.0.0`, `react ^18 | ^19`.

## Use

`main.tsx` of a VK Mini App:

```tsx
import bridge from "@vkma.dev/bridge";
import { VKBridgeConfigProvider } from "@vkma.dev/vkui-bridge";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "@vkontakte/vkui/dist/vkui.css";

// Tell the host the app is ready: folds the host preloader, enables history.
void bridge.send("VKWebAppInit");

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <VKBridgeConfigProvider>
            <App />
        </VKBridgeConfigProvider>
    </StrictMode>,
);
```

`VKBridgeConfigProvider` composes `ConfigProvider` → `AdaptivityProvider` → `AppRoot(mode="full")` with bridge-computed defaults:

| ConfigProvider prop         | Source                                                                           |
| --------------------------- | -------------------------------------------------------------------------------- |
| `colorScheme`               | `VKWebAppUpdateConfig` + a `VKWebAppGetConfig` bootstrap (`useBridgeAppearance`) |
| `platform`                  | `"vkcom"` when `vk_platform === "desktop_web"` in the launch params              |
| `isWebView`                 | `bridge.isWebView()`                                                             |
| `hasCustomPanelHeaderAfter` | always `true` — reserves the PanelHeader corner for the host controls            |
| `AdaptivityProvider` props  | host adaptivity via `transformVKBridgeAdaptivity(useBridgeAdaptivity())`         |
| `AppRoot.safeAreaInsets`    | `VKWebAppUpdateInsets` / config insets via `useBridgeInsets`                     |

Any prop you pass explicitly wins over the computed value — the whole `ConfigProvider` surface is accepted and spread last.

## Hooks

Every hook reads the default bridge singleton of `@vkma.dev/bridge` and subscribes with an isomorphic layout effect:

- **`useBridgeAppearance()`** → `ColorSchemeType | undefined` — streamed from `VKWebAppUpdateConfig`, bootstrapped with `VKWebAppGetConfig`. In a plain browser (not embedded) it stays `undefined` and VKUI falls back to its own system detection.
- **`useBridgeInsets()`** → `SafeAreaInsets | undefined` — `VKWebAppUpdateInsets` and the insets field of `VKWebAppUpdateConfig`; a `bottom` beyond the virtual keyboard's ceiling (150) is clamped to `0`, so the layout doesn't absorb the transient keyboard.
- **`useBridgeAdaptivity()`** → `{ type, viewportWidth, viewportHeight }` — the host's verdict (`adaptive`, `force_mobile`, `force_mobile_compact`, or `null`) plus the viewport at the last change; only configs carrying both `viewport_width` and `viewport_height` advance it.

Feed the adaptivity hook through **`transformVKBridgeAdaptivity(adaptivity)`** → `AdaptivityProvider` props (`AdaptivityProps`).

## Pure helpers

The resolvers behind the hooks are exported for tests and non-React consumers:

- `resolveAppearance(data)` — `appearance` field wins, legacy `space_gray`/`vkcom_dark` schemes map to dark, everything else is light
- `resolveAdaptivity(data)` — the known directives kept, unknown ones become `null`, non-finite viewports become `0`
- `resolveInsets(event)` — both inset sources, with the keyboard clamp
- `transformVKBridgeAdaptivity(adaptivity)` — bridge vocabulary → `AdaptivityProps`

Types: `BridgeConfigData`, `BridgeAdaptivity`, `VKBridgeConfigProviderProps`.

## License

MIT.
