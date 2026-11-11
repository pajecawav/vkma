---
title: devtools
description: "Панель /__vkma/ на твоём dev-сервере: живой диалог с мостом, клиенты и execute."
sidebar:
    order: 0
    label: "Описание"
---

`@vkma.dev/devtools` — devtools для VK Mini Apps: панель `/__vkma/` на твоём собственном dev-сервере с живым диалогом VK Bridge (исходящие send'ы, парные ответы, входящие события), реестром подключённых клиентов и execute.

```sh
# Vite:
npm install -D @vkma.dev/devtools @vkma.dev/bridge devframe @devframes/vite
# Rsbuild (vite не нужен):
npm install -D @vkma.dev/devtools @vkma.dev/bridge devframe
```

Жёсткая зависимость — только используемый адаптер: `vite` и `@devframes/vite` опциональные пиры (Vite-режим), `@rsbuild/core` — тоже (Rsbuild-режим).

```ts
// vite.config.ts
import { vkmaDevtools } from "@vkma.dev/devtools";

export default {
    plugins: [vkmaDevtools()],
};
```

Одна строка даёт мини-аппу:

- **`/__vkma/`.** Панель (SPA + RPC/WebSocket на порту самого Vite, как `/__unocss` у UnoCSS).
- **Алиас моста.** Импорты `@vkontakte/vk-bridge`, включая зависимости, ведут на `@vkma.dev/bridge` с tap devtools. Код приложения менять не нужно. Отключается `alias: false`.
- **FAB.** Плавающая кнопка на странице приложения, открывающая ту же панель оверлеем. Начальное место настраивается: `vkmaDevtools({ fabPosition: "bottom-left" })` (`bottom-left`, `bottom` или `bottom-right`, по умолчанию `bottom-left`); место, выбранное в панели, запоминается на origin и побеждает настройку.

## Что получаешь

- **Timeline.** Журнал трафика моста: каждый send открывает группу запроса с парным ответом внутри (длительность round-trip, метка ok/error); несолиситедные события VK стоят отдельно. Фильтрация по типу и имени; полезные нагрузки разворачиваются в сворачиваемое JSON-дерево с копированием.
- **Execute.** Отправь любое событие моста в выбранного клиента прямо из панели; результат round-trip вернётся туда же.
- **Клиенты.** Каждый подключённый скрипт страницы (десктоп-таб, телефон в LAN, iframe, standalone) с UA, платформой, launch params.
- **Embedded scope.** Панель FAB показывает трафик только своей страницы (цветной бейдж клиента в шапке); перезагрузка страницы сбрасывает её историю.
- **MCP для кодинг-агентов.** Выключено по умолчанию; включается опцией `mcp`.

## Дальше

- [Vite-плагин](/devtools/vite/) — установка и опции `vkmaDevtools`.
- [Rsbuild-адаптер](/devtools/rsbuild/) — та же панель без Vite.
- [Панель](/devtools/panel/) — timeline, execute, клиенты, встроенный scope.
- [MCP](/devtools/mcp/) — трафик моста и execute для кодинг-агентов.

## Ссылка

- [npm: @vkma.dev/devtools](https://www.npmjs.com/package/@vkma.dev/devtools)
