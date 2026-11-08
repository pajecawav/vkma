---
title: vkui-bridge
description: "React glue between the bridge and VKUI: host theme, insets and adaptivity in one provider."
sidebar:
    order: 0
---

`@vkma.dev/vkui-bridge` is React glue between [`@vkma.dev/bridge`](/en/bridge/) and [`@vkontakte/vkui`](https://github.com/VKCOM/VKUI). The provider streams the host's theme, safe-area insets and adaptivity from bridge events into a ready `ConfigProvider` shell. Semantics copy [`@vkontakte/vk-bridge-react`](https://www.npmjs.com/package/@vkontakte/vk-bridge-react).

```sh
npm install @vkma.dev/vkui-bridge
# peers: @vkma.dev/bridge ^0.2.0, @vkontakte/vkui ^8.0.0, react ^18 | ^19
```

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

| ConfigProvider prop         | Source                                                                              |
| --------------------------- | ----------------------------------------------------------------------------------- |
| `colorScheme`               | `VKWebAppUpdateConfig` plus a `VKWebAppGetConfig` bootstrap (`useBridgeAppearance`) |
| `platform`                  | `"vkcom"` when `vk_platform === "desktop_web"` in the launch params                 |
| `isWebView`                 | `bridge.isWebView()`                                                                |
| `hasCustomPanelHeaderAfter` | always `true`, reserving the PanelHeader corner for the host controls               |
| `AdaptivityProvider` props  | host adaptivity via `transformVKBridgeAdaptivity(useBridgeAdaptivity())`            |
| `AppRoot.safeAreaInsets`    | `VKWebAppUpdateInsets` and config insets via `useBridgeInsets`                      |

Any prop the app passes explicitly wins over the computed value. The provider accepts the whole `ConfigProvider` prop surface and spreads it last.

## Hooks

Every hook reads the default bridge singleton and subscribes with an isomorphic layout effect.

- **`useBridgeAppearance()`** returns `ColorSchemeType | undefined`. Streams `VKWebAppUpdateConfig` and bootstraps with `VKWebAppGetConfig`. In a plain browser (not embedded) it stays `undefined`, and VKUI falls back to its own system detection.
- **`useBridgeInsets()`** returns `SafeAreaInsets | undefined`. Reads `VKWebAppUpdateInsets` and the insets field of the config. A `bottom` beyond 150 (the virtual keyboard's ceiling) is clamped to `0`, so the layout does not absorb the transient keyboard.
- **`useBridgeAdaptivity()`** returns `{ type, viewportWidth, viewportHeight }`. `type` is the host verdict (`adaptive`, `force_mobile`, `force_mobile_compact`, or `null`) plus the viewport at the last change.

## Links

- [npm: @vkma.dev/vkui-bridge](https://www.npmjs.com/package/@vkma.dev/vkui-bridge)

## Sections

- [Hooks](/en/vkui-bridge/hooks/) — the three hooks' signatures and boundaries.
- [Provider](/en/vkui-bridge/provider/) — `VKBridgeConfigProvider` and overrides.
