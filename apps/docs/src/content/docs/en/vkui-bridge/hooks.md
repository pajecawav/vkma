---
title: "Hooks"
description: "useBridgeAppearance, useBridgeInsets, useBridgeAdaptivity: signatures and boundaries."
sidebar:
    order: 1
---

Three hooks stream the host's verdict — theme, safe-area insets and adaptivity — out of bridge events. The semantics are 1:1 with `@vkontakte/vk-bridge-react`. Every hook reads the default `@vkma.dev/bridge` singleton and subscribes with an isomorphic layout effect.

## useBridgeAppearance

```ts
function useBridgeAppearance(): ColorSchemeType | undefined;
```

The host's theme: streamed from `VKWebAppUpdateConfig` and bootstrapped with a `VKWebAppGetConfig` round trip. Returns a `ColorSchemeType` (`"light"` | `"dark"`) or `undefined`.

Boundaries:

- The hook is inert outside the sandbox: while `bridge.isEmbedded()` is false there is no subscription. A plain browser gets `undefined`, and VKUI falls back to its own system theme detection.
- An event counts only when it carries both keys — `appearance` and `scheme`.

Value resolution: the modern `appearance` field wins; the legacy `space_gray` and `vkcom_dark` schemes map to `"dark"`, everything else to `"light"`.

## useBridgeInsets

```ts
function useBridgeInsets(): SafeAreaInsets | undefined;
```

Safe-area insets for `AppRoot.safeAreaInsets`. Two sources: `VKWebAppUpdateInsets` events and the `insets` field of config payloads. Unlike appearance there is no embed gate — VKUI itself decides what to do with the absence.

The boundary is the virtual-keyboard clamp: a `bottom` beyond 150 becomes `0`. The 150 is the transient keyboard's height ceiling; without the clamp the layout would absorb the keyboard into its safe area on every input focus.

## useBridgeAdaptivity

```ts
interface BridgeAdaptivity {
    type: "adaptive" | "force_mobile" | "force_mobile_compact" | null;
    viewportWidth: number;
    viewportHeight: number;
}

function useBridgeAdaptivity(): BridgeAdaptivity;
```

The host's adaptivity verdict: streamed from `VKWebAppUpdateConfig`, bootstrapped with `VKWebAppGetConfig`, holding the last received values.

The advance condition: the state moves only on events carrying both `viewport_width` and `viewport_height` — configs with a single viewport side are ignored. An unknown directive becomes `null`, non-finite viewports become `0`.

For `AdaptivityProvider`, feed the value through the transformer:

```ts
import { transformVKBridgeAdaptivity } from "@vkma.dev/vkui-bridge";

const adaptivityProps = transformVKBridgeAdaptivity(useBridgeAdaptivity());
```

## Pure resolvers

The hooks' logic is exported separately — for tests and non-React consumers:

- `resolveAppearance(data)` — `BridgeConfigData` → the theme, with the legacy scheme mapping;
- `resolveAdaptivity(data)` — the directive → `BridgeAdaptivity` (unknown ones become `null`);
- `resolveInsets(event)` — both inset sources with the keyboard clamp;
- `transformVKBridgeAdaptivity(adaptivity)` — the bridge vocabulary → `AdaptivityProvider` props.

The shared payload type is `BridgeConfigData` (the overlap of the config-shaped payloads: `VKWebAppUpdateConfig`, the `VKWebAppGetConfig` result, `VKWebAppUpdateInsets`): `scheme`, `appearance`, `insets`, `adaptivity`, `viewport_width`, `viewport_height` — each optional, since host platforms ship different subsets.

The preassembled provider built from these hooks — in [the provider](/en/vkui-bridge/provider/).
