---
title: Структура приложения
description: "Что генерит скаффолдер: дерево файлов, скрипты, конфиги devtools и деплоя."
sidebar:
    order: 3
---

Дерево пресета `router` — старший из трёх (отличия ниже):

```
my-app/
├── index.html              # точка входа: <div id="root">, lang="ru"
├── package.json            # имя из каталога, скрипты, caret-диапазоны
├── tsconfig.json           # strict, moduleResolution: bundler, noEmit
├── vite.config.ts          # react() + vkmaDevtools()
├── vkma-deploy.config.ts   # appId, staticPath, endpoints
├── .gitignore
├── README.md               # как запускать и деплоить
└── src/
    ├── main.tsx            # VKWebAppInit + провайдеры + роутер
    ├── app.tsx             # createApp: views, modals, popouts
    ├── shell.tsx           # Epic + Tabbar, история из роутера
    ├── overlays.tsx        # глобальная модалка и popout
    ├── data.ts             # демо-контент ленты
    └── panels/
        ├── feed/           # feed.panel.ts (хаб) + feed.ui.tsx + post.ui.tsx
        ├── more/           # more.panel.ts + more.ui.tsx + notifications.ui.tsx
        └── profile/        # profile.panel.ts + profile.ui.tsx + settings.ui.tsx
```

В `base` вместо `app.tsx`, `shell.tsx` и `panels/` — один `App.tsx` с демкой моста плюс `App.css`. В `vkui` — `App.tsx` с Epic/Tabbar на `useState` и каталог `views/` (`ProfileView`, `FeedView`, `MoreView`).

## Скрипты

| Скрипт    | Что делает                                                     |
| --------- | -------------------------------------------------------------- |
| `dev`     | `vite` — dev-сервер с панелью `/__vkma/`                       |
| `build`   | `tsc --noEmit && vite build` — проверка типов, бандл в `dist/` |
| `preview` | `vite preview` — локальный прогон сборки                       |
| `deploy`  | `vkma-deploy` — публикация `dist/` в хостинг VK Mini Apps      |

`build` сначала прогоняет `tsc --noEmit` по strict-конфигу. Сборка не начнётся, пока есть ошибки типов.

## vite.config.ts

```ts
import react from "@vitejs/plugin-react";
import { vkmaDevtools } from "@vkma.dev/devtools";
import { defineConfig } from "vite";

export default defineConfig({
    plugins: [react(), vkmaDevtools()],
});
```

Плагин `vkmaDevtools()` вешает панель devtools на `/__vkma/`: timeline всех событий моста, подключённые клиенты и интерактивный execute. У моста в приложении уже есть tap, и панель видит трафик без настройки.

## vkma-deploy.config.ts

```ts
import { defineDeployConfig } from "@vkma.dev/deploy";

export default defineDeployConfig({
    // Создай приложение на dev.vk.com/admin/apps-list и впиши его id.
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

Деплой: проставь `appId`, один раз залогинься `npx vkma-deploy login`, затем `npm run deploy`. Подробности в разделе [deploy](/deploy/).

## main.tsx

Общее для всех пресетов: `bridge.send("VKWebAppInit")` сворачивает прелоадер хоста, дальше `createRoot` с `StrictMode`. Отличия по пресетам:

- `base` — монтирует `<App />`;
- `vkui` — подключает `vkui.css` и оборачивает `<App />` в `<VKBridgeConfigProvider>` из `@vkma.dev/vkui-bridge`;
- `router` — то же, плюс `RouterProvider` и две связки: `createBridgeSync` сообщает хосту локацию приложения, `createSwipeBackManager` включает нативный swipe-back.

## package.json

Имя пакета — санитизированное имя каталога (`My App` → `my-app`), `private: true`, `type: "module"`, `engines.node: >=22.18.0`. Версии зависимостей — caret-диапазоны. Заголовок в `index.html` и README подставляется из имени приложения.

Какой пресет что генерит, рассказано в [пресетах](/create-app/presets/), а управление генерацией описано в [CLI](/create-app/cli/).
