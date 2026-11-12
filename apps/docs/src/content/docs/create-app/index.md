---
title: create-app
description: "Скаффолдер VK Mini App: Vite, мост, devtools и деплой за одну команду."
sidebar:
    order: 0
    label: "Описание"
---

`@vkma.dev/create-app` генерирует VK Mini App за одну команду: Vite плюс стек vkma.dev, TypeScript strict по умолчанию.

```sh
npm create @vkma.dev/app my-app
# или: pnpm create @vkma.dev/app my-app · yarn create @vkma.dev/app my-app
# bun: bunx @vkma.dev/create-app my-app
```

## Пресеты

| Пресет                  | Стек                                                                            |
| ----------------------- | ------------------------------------------------------------------------------- |
| `base`                  | React + Vite + `@vkma.dev/bridge`, devtools-панель, деплой, без UI-кита         |
| `vkui`                  | `base` + VKUI 8, навигация Epic/Tabbar на локальном состоянии                   |
| `router` (по умолчанию) | `base` + `@vkma.dev/router` + VKUI, URL-driven вьюхи, панели, модалки, popout'ы |

Каждое сгенерированное приложение уже содержит:

- `@vkma.dev/bridge` — мост со встроенным tap для devtools
- devtools vite-плагин и панель `/__vkma/` (timeline моста, клиенты, execute)
- `@vkma.dev/deploy`: `vkma-deploy.config.ts`, `npm run deploy`, `npx vkma-deploy login`
- TypeScript strict, `engines`, README, `.gitignore`

В пресеты `vkui` и `router` входит `@vkma.dev/vkui-bridge`, собранный `<VKBridgeConfigProvider>` (тема хоста, safe-area insets, адаптивность, платформа `vkcom`), подключённый в `main.tsx`.

## CLI

```
Usage: npm create @vkma.dev/app [path] [flags]

Flags:
  --preset <id>   Пресет (по умолчанию router)
  --pm <id>       Менеджер пакетов: npm | pnpm | yarn | bun
  --no-install    Не устанавливать зависимости
  --no-git        Не инициализировать git
  -h, --help      Справка
```

В интерактивном терминале CLI спрашивает недостающее; с флагами работает полностью неинтерактивно (подходит для CI).

## Свежесть шаблонов

Версии зависимостей в шаблонах обновляются автоматически, и каждый скаффолд выдаёт актуальные версии; в твой `package.json` они записываются caret-диапазонами.

## Подробнее

- [Пресеты](/create-app/presets/) — что генерит каждый и кому он подходит
- [CLI](/create-app/cli/) — флаги, интерактивный и CI-режим
- [Структура приложения](/create-app/structure/) — дерево файлов, скрипты, конфиги

## Ссылки

- [npm: @vkma.dev/create-app](https://www.npmjs.com/package/@vkma.dev/create-app)
