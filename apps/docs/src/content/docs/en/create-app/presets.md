---
title: Presets
description: "base, vkui and router: what each one scaffolds and who it is for."
sidebar:
    order: 1
---

There are three presets. Every one builds on the same base template — React + Vite + `@vkma.dev/bridge`, the devtools plugin and deploy; a preset overlay adds dependencies and replaces some of the sources. Pick by what you need from the UI kit and navigation — the [structure](/en/create-app/structure/) of the generated app differs exactly here.

## base

React + Vite + `@vkma.dev/bridge`, no UI kit.

- `src/App.tsx` — a bridge demo: a typed `send("VKWebAppGetUserInfo")` and a subscription to host events via `bridge.subscribe` (it returns its own off function — a ready `useEffect` cleanup).
- `src/main.tsx` sends `VKWebAppInit` (folds the host preloader) and mounts `<App />` in `StrictMode`.
- Styling is a single `src/App.css`; no UI framework.

Take it when you bring your own UI stack (Tailwind, another kit) or want the smallest possible starting point.

## vkui

`base` + VKUI 8, `@vkontakte/icons` and `@vkma.dev/vkui-bridge`.

- `src/main.tsx` imports `@vkontakte/vkui/dist/vkui.css` and wraps the app in `<VKBridgeConfigProvider>` from `@vkma.dev/vkui-bridge`: the host theme, safe-area insets and adaptivity stream in from bridge events.
- `src/App.tsx` — the shell from the VKUI navigation guide: `SplitLayout` with a `Cell` sidebar on desktop, `Epic` + `Tabbar` on mobile. The active story lives in `useState`.
- Three stories in `src/views/`: `ProfileView`, `FeedView`, `MoreView`.

Take it when you want the native VKUI look and story switching without URL routing: navigation stays in local state.

## router

The default preset: `base` + `@vkma.dev/router` on TanStack Router + VKUI.

- `src/app.tsx` — the app tree: `createApp` with three views, a `settings` modal and a `logout` popout; the router runs on `createVkHistory` (hash mode), `routeMasks` keep a modal from writing its own path into the URL.
- `src/shell.tsx` — the same `Epic` + `Tabbar` shell, but the active story comes from the router (`useActiveStory`), and tabs are `createVkLink` wrappers with `replace`, so Back never walks the tab bar.
- `src/panels/<story>/` — `defineView("feed")` hubs and panels like `feedView.panel("post/$id", {}, () => import("./post.ui"))`: lazy chunks and typed path params.
- `src/overlays.tsx` — the global modal and popout, openable from any panel.
- `src/main.tsx` wires history to the host: `createBridgeSync` reports the app location, `createSwipeBackManager` enables native swipe-back.

Take it for everything else: panels with a back stack, deep links, modals and popouts as URLs. When in doubt, this is the safe default.

## Comparison

|                              | base   | vkui                     | router                                     |
| ---------------------------- | ------ | ------------------------ | ------------------------------------------ |
| UI kit                       | —      | VKUI 8                   | VKUI 8                                     |
| Navigation                   | manual | Epic/Tabbar, `useState`  | Epic/Tabbar, URL history                   |
| URL: panels, modals, popouts | —      | —                        | yes                                        |
| `<VKBridgeConfigProvider>`   | —      | in `main.tsx`            | in `main.tsx`                              |
| Extra dependencies           | —      | vkui, icons, vkui-bridge | router, tanstack, vkui, icons, vkui-bridge |

## Scaffolding a preset

The preset comes from the `--preset` flag, or from the interactive list (defaulting to `router`):

```sh
npm create @vkma.dev/app my-app -- --preset base
npm create @vkma.dev/app my-app -- --preset vkui
npm create @vkma.dev/app my-app -- --preset router   # also the no-flag default
```

All invocation forms and the remaining flags — in the [CLI](/en/create-app/cli/).

Next: the [structure of the generated app](/en/create-app/structure/).
