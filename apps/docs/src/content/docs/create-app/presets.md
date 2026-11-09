---
title: Пресеты
description: "base, vkui и router: что генерит каждый и кому он подходит."
sidebar:
    order: 1
---

Пресетов три. Каждый строится на одном базовом шаблоне — React + Vite + `@vkma.dev/bridge`, devtools-плагин и деплой; пресет-оверлей добавляет зависимости и заменяет часть исходников. Выбирай по потребности в UI-ките и навигации — [структура](/create-app/structure/) готового приложения отличается именно здесь.

## base

React + Vite + `@vkma.dev/bridge`, без UI-кита.

- `src/App.tsx` — демка моста: типизированный `send("VKWebAppGetUserInfo")` и подписка на события хоста через `bridge.subscribe` (возвращает функцию off — готовый cleanup для `useEffect`).
- `src/main.tsx` отправляет `VKWebAppInit` (сворачивает прелоадер хоста) и монтирует `<App />` в `StrictMode`.
- Стилизация — единственный `src/App.css`, никакого UI-фреймворка.

Бери, когда приносишь свой UI-стек (Tailwind, другой кит) или хочешь минимальную заготовку без лишнего слоя.

## vkui

`base` + VKUI 8, `@vkontakte/icons` и `@vkma.dev/vkui-bridge`.

- `src/main.tsx` подключает `@vkontakte/vkui/dist/vkui.css` и оборачивает приложение в `<VKBridgeConfigProvider>` из `@vkma.dev/vkui-bridge`: тема хоста, safe-area insets и адаптивность стримятся из событий моста.
- `src/App.tsx` — оболочка по гайду навигации VKUI: `SplitLayout` с сайдбаром из `Cell` на десктопе и `Epic` + `Tabbar` на мобильных. Активная история хранится в `useState`.
- Три истории в `src/views/`: `ProfileView`, `FeedView`, `MoreView`.

Бери, когда нужен фирменный вид VKUI, а переключение историй без URL-роутинга устраивает: навигация живёт в локальном состоянии.

## router

Пресет по умолчанию: `base` + `@vkma.dev/router` на TanStack Router + VKUI.

- `src/app.tsx` — дерево приложения: `createApp` с тремя вьюхами, модалкой `settings` и popout'ом `logout`; роутер на `createVkHistory` (hash-режим), `routeMasks` не даёт модалке писать свой путь в URL.
- `src/shell.tsx` — та же оболочка `Epic` + `Tabbar`, но активная история читается из роутера (`useActiveStory`), а табы — обёртки `createVkLink` с `replace`, чтобы кнопка «назад» не листала табы.
- `src/panels/<история>/` — хабы `defineView("feed")` и панели вида `feedView.panel("post/$id", {}, () => import("./post.ui"))`: ленивые чанки и типизированные path-параметры.
- `src/overlays.tsx` — глобальные модалка и popout, открываются с любой панели.
- `src/main.tsx` связывает историю с хостом: `createBridgeSync` сообщает хосту локацию, `createSwipeBackManager` включает нативный swipe-back.

Бери для всего остального: панели с back-стеком, deep links, модалки и popout'ы как URL. Если сомневаешься — это безопасный выбор по умолчанию.

## Сравнение

|                                | base    | vkui                     | router                                     |
| ------------------------------ | ------- | ------------------------ | ------------------------------------------ |
| UI-кит                         | —       | VKUI 8                   | VKUI 8                                     |
| Навигация                      | вручную | Epic/Tabbar, `useState`  | Epic/Tabbar, история из URL                |
| URL: панели, модалки, popout'ы | —       | —                        | есть                                       |
| `<VKBridgeConfigProvider>`     | —       | в `main.tsx`             | в `main.tsx`                               |
| Доп. зависимости               | —       | vkui, icons, vkui-bridge | router, tanstack, vkui, icons, vkui-bridge |

## Скаффолд пресета

Пресет задаётся флагом `--preset`, а в интерактивном режиме — выбором из списка (по умолчанию `router`):

```sh
npm create @vkma.dev/app my-app -- --preset base
npm create @vkma.dev/app my-app -- --preset vkui
npm create @vkma.dev/app my-app -- --preset router   # и без флага
```

Все формы вызова и остальные флаги — в [CLI](/create-app/cli/).

Дальше: [структура сгенерированного приложения](/create-app/structure/).
