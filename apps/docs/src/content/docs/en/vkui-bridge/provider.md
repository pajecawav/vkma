---
title: "Provider"
description: "VKBridgeConfigProvider: computed defaults, prop overrides, and composition order."
sidebar:
    order: 2
---

`VKBridgeConfigProvider` is the preassembled VKUI shell of a mini app: three VKUI providers with defaults computed from the bridge. Wrap the whole app — inside `StrictMode`, outside your root component.

## Composition

```tsx
<VKBridgeConfigProvider>
    <App />
</VKBridgeConfigProvider>
```

Inside, the provider renders:

```tsx
<ConfigProvider /* bridge defaults + your overrides */>
    <AdaptivityProvider /* transformVKBridgeAdaptivity(useBridgeAdaptivity()) */>
        <AppRoot mode="full" safeAreaInsets={insets}>
            {children}
        </AppRoot>
    </AdaptivityProvider>
</ConfigProvider>
```

The order is fixed: `ConfigProvider` → `AdaptivityProvider` → `AppRoot`. `AppRoot` carries `mode="full"` — the app lives not in a widget but on the host's full screen.

## What is computed

| ConfigProvider prop         | Source                                                                           |
| --------------------------- | -------------------------------------------------------------------------------- |
| `colorScheme`               | `VKWebAppUpdateConfig` + a `VKWebAppGetConfig` bootstrap (`useBridgeAppearance`) |
| `platform`                  | `"vkcom"` when `vk_platform === "desktop_web"` in the launch params              |
| `isWebView`                 | `bridge.isWebView()`                                                             |
| `hasCustomPanelHeaderAfter` | always `true`, reserving the PanelHeader corner for the host controls            |
| `AdaptivityProvider` props  | `transformVKBridgeAdaptivity(useBridgeAdaptivity())`                             |
| `AppRoot.safeAreaInsets`    | `VKWebAppUpdateInsets` and config insets via `useBridgeInsets`                   |

The logic of each source is in [the hooks](/en/vkui-bridge/hooks/): the provider just assembles them into one tree.

## Overrides

The provider's props are the whole `Partial<ConfigProviderProps>` surface plus `children`. A prop passed explicitly wins over the computed value: the provider spreads the overrides last, after the bridge defaults.

```tsx
// pin the theme regardless of the host
<VKBridgeConfigProvider colorScheme="dark">
    <App />
</VKBridgeConfigProvider>
```

Typical uses: a forced theme for a settings view, a debug platform, `locale`. Pass nothing — and the bridge defaults apply.

## Boundaries

- `platform` is computed for `desktop_web` only; on every other platform it stays `undefined`, and VKUI derives the platform from its own heuristics.
- `useBridgeAppearance` returns `undefined` outside the sandbox (see [hooks](/en/vkui-bridge/hooks/)) — in a plain browser VKUI resolves the theme unless you pass `colorScheme` explicitly.
- Outside a mini app the `VKWebAppGetConfig` bootstrap fails: the error lands in the console but never touches the app.
