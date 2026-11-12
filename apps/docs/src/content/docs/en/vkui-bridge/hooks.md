---
title: "vkui-bridge hooks: appearance, insets, adaptivity"
description: "useBridgeAppearance, useBridgeInsets, useBridgeAdaptivity: signatures and boundaries."
sidebar:
    order: 1
    label: "Hooks"
---

Three hooks stream the host's verdict out of bridge events: the theme, safe-area insets and adaptivity. The semantics are 1:1 with `@vkontakte/vk-bridge-react`. Every hook reads the default `@vkma.dev/bridge` instance.

## useBridgeAppearance

```ts
function useBridgeAppearance(): ColorSchemeType | undefined;
```

The host's theme: streamed from `VKWebAppUpdateConfig` and bootstrapped with a `VKWebAppGetConfig` round trip. Returns a `ColorSchemeType` (`"light"` | `"dark"`) or `undefined`.

Outside a mini app the hook returns `undefined`. VKUI resolves the theme itself. The legacy `space_gray` and `vkcom_dark` schemes come back as `"dark"`, everything else as `"light"`.

## useBridgeInsets

```ts
function useBridgeInsets(): SafeAreaInsets | undefined;
```

Safe-area insets for `AppRoot.safeAreaInsets`. Reads `VKWebAppUpdateInsets` events and the `insets` field of the config. Outside a mini app it returns `undefined`. VKUI itself decides what to do with the absence.

A `bottom` beyond 150 becomes `0`: without the clamp the virtual keyboard would land in the safe area on every input focus.

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

An unknown adaptivity directive becomes `null`, non-finite viewports become `0`.

For `AdaptivityProvider`, feed the value through the transformer:

```ts
import { transformVKBridgeAdaptivity } from "@vkma.dev/vkui-bridge";

const adaptivityProps = transformVKBridgeAdaptivity(useBridgeAdaptivity());
```

## Pure resolvers

The hooks' logic is exported separately, for tests and non-React consumers:

- `resolveAppearance(data)` — `BridgeConfigData` → the theme, with the legacy scheme mapping;
- `resolveAdaptivity(data)` — the directive → `BridgeAdaptivity` (unknown ones become `null`);
- `resolveInsets(event)` — both inset sources with the keyboard clamp;
- `transformVKBridgeAdaptivity(adaptivity)` — the bridge vocabulary → `AdaptivityProvider` props.

The shared payload type is `BridgeConfigData` (the overlap of the config-shaped payloads: `VKWebAppUpdateConfig`, the `VKWebAppGetConfig` result, `VKWebAppUpdateInsets`): `scheme`, `appearance`, `insets`, `adaptivity`, `viewport_width`, `viewport_height`. Each field is optional, since host platforms ship different subsets.

The provider assembled from these hooks is described in [the provider](/en/vkui-bridge/provider/).
