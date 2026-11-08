---
title: router
description: "Роутер VK Mini Apps на TanStack Router: вьюхи, панели, модалки и popout'ы как URL."
sidebar:
    order: 0
    label: "Описание"
---

`@vkma.dev/router` — роутер для VK Mini Apps поверх [TanStack Router](https://tanstack.com/router). Вьюхи, панели, модалки и popout'ы управляются URL и рендерятся хостами VKUI: типизированные хэндлы вместо строковых id, синхронизация с VK-историей и хостом (`VKWebAppSetLocation`, `VKWebAppChangeFragment`), управление swipe-back. Feature parity с `@vkontakte/vk-mini-apps-router`, но не API parity.

```sh
npm install @vkma.dev/router @tanstack/react-router
# peers: @tanstack/react-router ^1.170, @vkontakte/vkui ^8 (опционально), react ^18 | ^19
```

## Объявление вьюх

```tsx
// panels/profile/profile.panel.ts — единственное место, где пишется ключ "profile"
import { defineView } from "@vkma.dev/router/preset";

export const profileView = defineView("profile");

// "index" владеет "/", "$id" объявляет типизированный path-параметр
export const profilePanel = profileView.panel("index", {}, () => import("./profile.ui"));
export const profileSettingsPanel = profileView.panel(
    "settings",
    {
        // loaders выполняются до монтирования панели; читаешь через usePanelLoaderData(profilePanel)
        loader: async () => ({ user: await bridge.send("VKWebAppGetUserInfo") }),
    },
    () => import("./profile.ui"),
);
```

## Приложение и роутер

```tsx
import { createRouter } from "@tanstack/react-router";
// app.tsx, дерево приложения + роутер
import { createApp, AppRootShell } from "@vkma.dev/router/preset";

export const app = createApp({
    root: AppRootShell, // или свой шелл (Epic/Tabbar, SplitCol sidebar…)
    views: [profileView /* … */],
    modals: {/* keyed entries */},
    popouts: {/* keyed entries */},
});

export const router = createRouter({
    routeTree: app.routeTree,
    history: createVkHistory({ mode: "hash" }).history, // или "hash-param"
    defaultNotFoundComponent: NotFound,
});

declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}
```

## VK-история

Два режима (по умолчанию `"hash"`): хэш и есть локация (`#/item/7`) или `hash-param` (`#?path=…` — чужие hash-параметры сохраняются, `location.search` не трогается). Глубокие ссылки, написанные в другом режиме, тоже разрешаются. Режим `"browser"` — дефолтная история TanStack.

## Ссылки

- [npm: @vkma.dev/router](https://www.npmjs.com/package/@vkma.dev/router)

## Разделы

- [Концепции](/router/concepts/) — URL-driven модель, слои, freeze-семантика хуков.
- [Вьюхи и панели](/router/views-and-panels/) — `defineView`, порядок анимаций, лоадеры.
- [Модалки и popout'ы](/router/modals-and-popouts/) — оверлеи как маршруты.
- [История и хост](/router/history/) — режимы URL, `VKWebAppSetLocation`, swipe-back.
- [Миграция с vk-mini-apps-router](/router/migration/) — маппинг API.
