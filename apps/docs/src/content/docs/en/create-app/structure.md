---
title: "create-app structure: the generated app"
description: "What the scaffolder generates: the file tree, scripts, devtools and deploy configs."
sidebar:
    order: 3
    label: "Structure"
---

The tree of the `router` preset, the richest of the three (differences below):

```
my-app/
├── index.html              # entry: <div id="root">, lang="ru"
├── package.json            # name from the directory, scripts, caret ranges
├── tsconfig.json           # strict, moduleResolution: bundler, noEmit
├── vite.config.ts          # react() + vkmaDevtools() + vkmaTunnel()
├── vkma-deploy.config.ts   # appId, staticPath, endpoints
├── .gitignore
├── README.md               # how to run and deploy
└── src/
    ├── main.tsx            # VKWebAppInit + providers + router
    ├── app.tsx             # createApp: views, modals, popouts
    ├── shell.tsx           # Epic + Tabbar, story from the router
    ├── overlays.tsx        # global modal and popout
    ├── data.ts             # demo feed content
    └── panels/
        ├── feed/           # feed.panel.ts (hub) + feed.ui.tsx + post.ui.tsx
        ├── more/           # more.panel.ts + more.ui.tsx + notifications.ui.tsx
        └── profile/        # profile.panel.ts + profile.ui.tsx + settings.ui.tsx
```

In `base`, the `app.tsx`/`shell.tsx`/`panels/` part collapses to a single `App.tsx` with the bridge demo plus `App.css`. In `vkui` it is an `App.tsx` with Epic/Tabbar on `useState` and a `views/` directory (`ProfileView`, `FeedView`, `MoreView`).

## Scripts

| Script    | What it does                                                        |
| --------- | ------------------------------------------------------------------- |
| `dev`     | `vite` — dev server with the `/__vkma/` panel                       |
| `build`   | `tsc --noEmit && vite build` — type check, bundle into `dist/`      |
| `preview` | `vite preview` — serve the production build locally                 |
| `deploy`  | `vkma-deploy` — publish `dist/` to VK Mini Apps hosting             |
| `tunnel`  | `vkma-tunnel --port 5173` — public HTTPS address for the dev server |

`build` runs `tsc --noEmit` against the strict config first. The bundle never starts while type errors remain.

`tunnel` is a separate process: the `vkma-tunnel` CLI opens a tunnel to the dev server already running on 5173 and prints the address. The plugin in `vite.config.ts` (below) does the same on its own, together with the dev server.

## vite.config.ts

```ts
import react from "@vitejs/plugin-react";
import { vkmaDevtools } from "@vkma.dev/devtools";
import { vkmaTunnel } from "@vkma.dev/tunnel/vite";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react(), vkmaDevtools(), vkmaTunnel({ enabled: false })],
});
```

The `vkmaDevtools()` plugin mounts the devtools panel at `/__vkma/`: a timeline of every bridge event, connected clients and interactive execute. The app's bridge already carries a tap, so the panel sees the traffic with zero setup.

The `vkmaTunnel()` plugin from `@vkma.dev/tunnel` gives the dev server a public HTTPS address: the app can be opened on a phone, or the address wired into the VK app settings, without deploying. The template ships it **off** (`enabled: false`), and it is enabled explicitly, one of two ways:

- `enabled: true` — the tunnel starts together with the dev server and prints its address next to Vite's lines;
- `npm run tunnel` in a second terminal while the dev server runs, the plugin staying off.

One of the two: both share the project's profile and would fight over its route. Details in the [tunnel](/en/tunnel/) section.

## vkma-deploy.config.ts

```ts
import { defineDeployConfig } from "@vkma.dev/deploy";

export default defineDeployConfig({
    // Create an app at dev.vk.com/admin/apps-list and put its id here.
    appId: 0,
    staticPath: "./dist",
    endpoints: {
        mobile: "index.html",
        mvk: "index.html",
        web: "index.html",
    },
    environment: "both",
});
```

To deploy: set `appId`, authorize once with `npx vkma-deploy login`, then `npm run deploy`. Details in the [deploy](/en/deploy/) section.

## main.tsx

Common to every preset: `bridge.send("VKWebAppInit")` folds the host preloader, then `createRoot` with `StrictMode`. Per-preset differences:

- `base` — mounts `<App />`;
- `vkui` — imports `vkui.css` and wraps `<App />` in `<VKBridgeConfigProvider>` from `@vkma.dev/vkui-bridge`;
- `router` — the same, plus `RouterProvider` and two wirings: `createBridgeSync` reports the app location to the host, `createSwipeBackManager` enables native swipe-back.

## package.json

The package name is the sanitized directory name (`My App` → `my-app`), with `private: true`, `type: "module"` and `engines.node: >=22.18.0`. Dependency versions are caret ranges. The title in `index.html` and the README is filled in from the app name.

What each preset generates is covered in [presets](/en/create-app/presets/), and controlling the generation in the [CLI](/en/create-app/cli/).
