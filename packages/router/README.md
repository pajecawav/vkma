# @vkma.dev/router

[![npm](https://img.shields.io/npm/v/@vkma.dev/router.svg)](https://www.npmjs.com/package/@vkma.dev/router)
[![minzip](https://img.shields.io/bundlephobia/minzip/@vkma.dev/router.svg)](https://bundlephobia.com/package/@vkma.dev/router)

A VK Mini Apps router on top of [TanStack Router](https://tanstack.com/router). Views, panels, modals and popouts are URL-driven and rendered by [`@vkontakte/vkui`](https://github.com/VKCOM/VKUI) hosts, with typed handles instead of string ids, VK history and host sync (`VKWebAppSetLocation`, `VKWebAppChangeFragment`), and native swipe-back management. Feature parity with `@vkontakte/vk-mini-apps-router`, not API parity. The [migration guide](https://github.com/pajecawav/vkma/tree/master/packages/router/docs/migration-from-vk-mini-apps-router.md) maps the old API to the new one.

## Install

```sh
npm install @vkma.dev/router @tanstack/react-router
# peers: @tanstack/react-router ^1.170, @vkontakte/vkui ^8 (optional), react ^18 | ^19
```

## Use

Declare a view hub, its panels and overlays, then mount the router:

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

```tsx
// main.tsx, mount + the host contract
import bridge from "@vkma.dev/bridge";
import { createBridgeSync, createSwipeBackManager } from "@vkma.dev/router";

void bridge.send("VKWebAppInit");
createBridgeSync({ history: router.history, bridge });
createSwipeBackManager({ history: router.history, bridge });

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <RouterProvider router={router} />
    </StrictMode>,
);
```

In components, navigate with typed handles, for example `const navigator = useNavigator(); navigator.push(profileSettingsPanel)`. Render router links out of any component with `createVkLink(TabbarItem)`.

## Entry points

| Import                    | Surface                                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `@vkma.dev/router`        | core: `createVkHistory`, panels-stack helpers, `createBridgeSync`, `createSwipeBackManager`                           |
| `@vkma.dev/router/react`  | data hooks (`usePanelParams`, `usePanelSearch`, `usePanelLoaderData` with departing-panel freeze, `usePanelsHistory`) |
| `@vkma.dev/router/vkui`   | VKUI hosts: `VkView`, `Modals`, `Popouts`, `NotFound`                                                                 |
| `@vkma.dev/router/preset` | the `createApp` builders + sugar: `AppRootShell`, `useActiveStory`, `useNavigator`, `createVkLink`, `useInflate`      |

## Decisions and design

`DESIGN.md` in the repo is the source of truth for every decision (the URL/history model, the `VkView` static-children world, overlay choreography, the v1 scope), with spike verdicts and implementation notes. The package [AGENTS.md](https://github.com/pajecawav/vkma/tree/master/packages/router/AGENTS.md) is the contributor entry.

## License

MIT.
