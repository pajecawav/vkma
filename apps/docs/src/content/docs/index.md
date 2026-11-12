---
title: Начало работы
description: Что такое vkma.dev, быстрый старт через create-app и карта пакетов.
---

vkma.dev — инструментарий для VK Mini Apps: собственный мост к платформе, роутер, devtools-панель, деплой и типизированные схемы событий и VK API. Пакеты публикуются под скоупом `@vkma.dev` и работают по отдельности: можно взять только мост, а можно собрать весь стек.

## Быстрый старт

```sh
npm create @vkma.dev/app my-app
```

CLI сгенерирует проект, установит зависимости и инициализирует git. Пресет выбирается интерактивно; без TTY передавай флаги:

```sh
npm create @vkma.dev/app my-app -- --preset router --pm pnpm
```

| Пресет                  | Стек                                                                            |
| ----------------------- | ------------------------------------------------------------------------------- |
| `base`                  | React + Vite + `@vkma.dev/bridge`, devtools-панель, деплой, без UI-кита         |
| `vkui`                  | `base` + VKUI 8, навигация Epic/Tabbar на локальном состоянии                   |
| `router` (по умолчанию) | `base` + `@vkma.dev/router` + VKUI, URL-driven вьюхи, панели, модалки, popout'ы |

Дальше:

```sh
cd my-app
npm run dev
```

Devtools-панель уже вшита в dev-сервер: открой `/__vkma/` и увидишь весь диалог с мостом в реальном времени.

## Пакеты

| Пакет                              | Что делает                                                                 |
| ---------------------------------- | -------------------------------------------------------------------------- |
| [`create-app`](/create-app/)       | скаффолдер: приложение на Vite за одну команду                             |
| [`bridge`](/bridge/)               | независимый VK Bridge: `send`/`subscribe`, таймауты, tap для observability |
| [`router`](/router/)               | роутер на TanStack Router: вьюхи, панели, модалки и popout'ы как URL       |
| [`vkui-bridge`](/vkui-bridge/)     | React-провайдер: тема, insets и адаптивность хоста в VKUI                  |
| [`devtools`](/devtools/)           | панель `/__vkma/` на твоём dev-сервере: timeline, execute, клиенты         |
| [`deploy`](/deploy/)               | деплой статики в хостинг VK Mini Apps, совместим с `vk-miniapps-deploy`    |
| [`bridge-schema`](/bridge-schema/) | каталог событий VK Bridge как данные + TypeScript-типы                     |
| [`api-schema`](/api-schema/)       | типы и zod/valibot-схемы всего VK API                                      |

## Ручная установка

Скаффолдер не обязателен. Мост в существующий проект:

```sh
npm install @vkma.dev/bridge
# или: pnpm add / yarn add / bun add
```

```ts
import bridge from "@vkma.dev/bridge";

await bridge.send("VKWebAppInit");
const user = await bridge.send("VKWebAppGetUserInfo");
```

Devtools к нему (Vite):

```sh
npm install -D @vkma.dev/devtools @vkma.dev/bridge devframe @devframes/vite
# или: pnpm add -D / yarn add -D / bun add -D
```

```ts
// vite.config.ts
import { vkmaDevtools } from "@vkma.dev/devtools";

export default {
    plugins: [vkmaDevtools()],
};
```

Деплой:

```sh
npm install -D @vkma.dev/deploy
# или: pnpm add -D / yarn add -D / bun add -D
npx vkma-deploy init
npx vkma-deploy login
npx vkma-deploy
```

## Что дальше

- [bridge](/bridge/) — отправка событий и подписки, таймауты, tap
- [router](/router/) — навигация мини-аппа на URL
- [devtools](/devtools/) — панель разработчика на твоём dev-сервере
- [deploy](/deploy/) — сборка и публикация в хостинг VK
