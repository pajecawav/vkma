---
title: vkui-bridge
description: "React glue between the bridge and VKUI: host theme, insets and adaptivity in one provider."
sidebar:
    order: 0
    label: "Overview"
---

`@vkma.dev/vkui-bridge` is React glue between [`@vkma.dev/bridge`](/en/bridge/) and [`@vkontakte/vkui`](https://github.com/VKCOM/VKUI). The provider streams the host's theme, safe-area insets and adaptivity from bridge events into a ready `ConfigProvider` shell. The semantics are 1:1 with [`@vkontakte/vk-bridge-react`](https://www.npmjs.com/package/@vkontakte/vk-bridge-react).

```sh
npm install @vkma.dev/vkui-bridge
# or: pnpm add / yarn add / bun add
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

`VKBridgeConfigProvider` composes `ConfigProvider` → `AdaptivityProvider` → `AppRoot(mode="full")` with bridge-computed defaults: the theme from `VKWebAppUpdateConfig` and a `VKWebAppGetConfig` bootstrap, insets from `VKWebAppUpdateInsets`, the `"vkcom"` platform on `desktop_web`. Any prop the app passes explicitly wins over the computed value. The full prop-to-source table is in [the provider](/en/vkui-bridge/provider/), the sources' logic in [the hooks](/en/vkui-bridge/hooks/).

## Hooks

Every hook reads the default bridge instance.

- **`useBridgeAppearance()`** returns `ColorSchemeType | undefined`. Streams `VKWebAppUpdateConfig` and bootstraps with `VKWebAppGetConfig`. Outside a mini app it returns `undefined` — VKUI resolves the theme itself.
- **`useBridgeInsets()`** returns `SafeAreaInsets | undefined`. Reads `VKWebAppUpdateInsets` and the insets field of the config. A `bottom` beyond 150 becomes `0` — the virtual-keyboard clamp.
- **`useBridgeAdaptivity()`** returns `{ type, viewportWidth, viewportHeight }`. `type` is the host verdict (`adaptive`, `force_mobile`, `force_mobile_compact`, or `null`) plus the viewport at the last change.

## Links

- [npm: @vkma.dev/vkui-bridge](https://www.npmjs.com/package/@vkma.dev/vkui-bridge)

## Sections

- [Hooks](/en/vkui-bridge/hooks/) — the three hooks' signatures and boundaries.
- [Provider](/en/vkui-bridge/provider/) — `VKBridgeConfigProvider` and overrides.
