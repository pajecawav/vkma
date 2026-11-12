---
title: "Router concepts: URL-driven navigation, four layers"
description: "The URL-driven model, the four package layers, and additivity over TanStack Router."
sidebar:
    order: 1
    label: "Concepts"
---

All navigation state lives in the URL: a view, a panel, a modal and a popout are TanStack Router routes. The host's back button, a reload and a deep link restore the screen with no separate navigation store.

## Feature parity, not API parity

`@vkma.dev/router` succeeds `@vkontakte/vk-mini-apps-router`: every capability of the old router is here, but the API is different. String panel ids are replaced by typed handles, the object route config by builders, and [TanStack Router](https://tanstack.com/router) does the matching underneath. Coming from the old package? Start with the [migration guide](/en/router/migration/).

## Four layers

One package, four subpath exports. The layers point strictly downward:

| Import                    | Layer                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------- |
| `@vkma.dev/router`        | React-free core: `createVkHistory`, `createBridgeSync`, `createSwipeBackManager`   |
| `@vkma.dev/router/react`  | data hooks with freeze semantics: `usePanelParams` and friends, `usePanelsHistory` |
| `@vkma.dev/router/vkui`   | VKUI hosts: `VkView`, `Modals`, `Popouts`, `NotFound`, `ModalPageSurface`          |
| `@vkma.dev/router/preset` | `createApp` + `defineView`/`definePanel`, `useNavigator`, `createVkLink`, sugar    |

Two rules keep the layers clean:

- VKUI never leaks below `/vkui` — the core runs in any React setup, with or without VKUI.
- The bridge is a structural `{ send, subscribe }`: both `@vkma.dev/bridge` and `@vkontakte/vk-bridge` fit; there is a hard dependency on neither.

Import from `/preset` when you build a VKUI app. The layer re-exports everything below it. The lower subpaths matter when you consume only part of the package.

## Additive over TanStack

TanStack is a peer dependency, and the package re-invents nothing on top of it. Route options (`loader`, `beforeLoad`, `validateSearch`, `lazy`, `pendingComponent`, …) pass into the routes untouched: everything TanStack Router does keeps working here. Its documentation applies to data and validation. The [bridge](/en/bridge/) and router packages answer different questions.

## Navigation tools

Everything the old router drove with string ids converges into two tools:

- `useNavigator()` — push/replace/back/backToFirst, `showModal`/`showGlobalModal`/`hideModal`, `showPopout`/`hidePopout` and `block`. The hook subscribes to no router state: what it needs is read from the live `router.state` at call time, so using the hook triggers no re-renders and the navigator object has a stable identity.
- `createVkLink(CellButton)` — turns any component into a typed link: the targets are the same Page objects `navigator.push` accepts.

Both take panel handles instead of strings, see [views and panels](/en/router/views-and-panels/).

## Static children instead of Outlet

The `/vkui` layer renders every panel of a view as an always-mounted VKUI `View` child; the router only feeds `activePanel`. Two consequences look like bugs but are inherent VKUI behavior:

- VKUI infers the animation direction from the declaration order of the children: a push that skips panels back animates BACK;
- `replace` still animates.

Details in [views and panels](/en/router/views-and-panels/).

## Freeze semantics of the data hooks

A panel stays mounted during the back animation while its route no longer matches. Raw TanStack hooks (`useParams`, `useLoaderData`) throw at that moment. Use the package hooks: `usePanelParams`, `usePanelSearch`, `usePanelLoaderData`. They never throw and retain the last value while the panel stays mounted.

## Next

- [Views and panels](/en/router/views-and-panels/) — `defineView`, animation order, loaders.
- [Modals and popouts](/en/router/modals-and-popouts/) — overlays as routes.
- [History and the host](/en/router/history/) — URL modes, `VKWebAppSetLocation`, swipe-back.
- [Migration](/en/router/migration/) — from `@vkontakte/vk-mini-apps-router`.
