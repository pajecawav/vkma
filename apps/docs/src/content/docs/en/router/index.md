---
title: router
description: "A VK Mini Apps router on TanStack Router: views, panels, modals and popouts as URLs."
sidebar:
    order: 0
---

`@vkma.dev/router` is a VK Mini Apps router on top of [TanStack Router](https://tanstack.com/router). Views, panels, modals and popouts are URL-driven and rendered by VKUI hosts: typed handles instead of string ids, VK history and host sync (`VKWebAppSetLocation`, `VKWebAppChangeFragment`), and native swipe-back management. Feature parity with `@vkontakte/vk-mini-apps-router`, not API parity.

```sh
npm install @vkma.dev/router @tanstack/react-router
# peers: @tanstack/react-router ^1.170, @vkontakte/vkui ^8 (optional), react ^18 | ^19
```

## Declaring views

```tsx
// panels/profile/profile.panel.ts, the one place the "profile" view key is written
import { defineView } from "@vkma.dev/router/preset";

export const profileView = defineView("profile");

// "index" owns "/", "$id" declares a typed path param
export const profilePanel = profileView.panel("index", {}, () => import("./profile.ui"));
export const profileSettingsPanel = profileView.panel(
    "settings",
    {
        // loaders run before the panel mounts; read them with usePanelLoaderData(profilePanel)
        loader: async () => ({ user: await bridge.send("VKWebAppGetUserInfo") }),
    },
    () => import("./profile.ui"),
);
```

## The app and the router

```tsx
import { createRouter } from "@tanstack/react-router";
// app.tsx, the app tree + the router
import { createApp, AppRootShell } from "@vkma.dev/router/preset";

export const app = createApp({
    root: AppRootShell, // or your own shell (Epic/Tabbar, SplitCol sidebar…)
    views: [profileView /* … */],
    modals: {/* keyed entries */},
    popouts: {/* keyed entries */},
});

export const router = createRouter({
    routeTree: app.routeTree,
    history: createVkHistory({ mode: "hash" }).history, // or "hash-param"
    defaultNotFoundComponent: NotFound,
});

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
```

## VK history

Two modes (default `"hash"`): the hash IS the location (`#/item/7`), or `"hash-param"` (`#?path=…` — foreign hash params preserved, `location.search` untouched). Deep links written by the other mode resolve too. The `"browser"` mode is TanStack's default history.

## Links

- [npm: @vkma.dev/router](https://www.npmjs.com/package/@vkma.dev/router)

## Sections

- [Concepts](/en/router/concepts/) — the URL-driven model, layers, hook freeze semantics.
- [Views and panels](/en/router/views-and-panels/) — `defineView`, animation order, loaders.
- [Modals and popouts](/en/router/modals-and-popouts/) — overlays as routes.
- [History and the host](/en/router/history/) — URL modes, `VKWebAppSetLocation`, swipe-back.
- [Migrating from vk-mini-apps-router](/en/router/migration/) — the API mapping.
