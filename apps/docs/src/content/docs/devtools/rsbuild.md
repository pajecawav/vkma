---
title: "Rsbuild-адаптер"
description: "vkmaDevtoolsRsbuild: та же панель /__vkma/ в Rsbuild, без Vite."
sidebar:
    order: 2
---

Rsbuild-приложению Vite не нужен. Адаптер живёт в субпате `@vkma.dev/devtools/rsbuild`:

```sh
npm install -D @vkma.dev/devtools @vkma.dev/bridge devframe
# или: pnpm add -D / yarn add -D / bun add -D
```

Peer-зависимость — `@rsbuild/core` >= 1.0. Подключи плагин в `rsbuild.config.ts`:

```ts
import { defineConfig } from "@rsbuild/core";
import { pluginReact } from "@rsbuild/plugin-react";
import { vkmaDevtoolsRsbuild } from "@vkma.dev/devtools/rsbuild";

export default defineConfig({
    plugins: [pluginReact(), vkmaDevtoolsRsbuild()],
});
```

Строка `vkma devtools → …` печатается при старте dev-сервера рядом с адресами приложения.

## Отличия от Vite-версии

Адрес и авторизация те же, что у Vite-версии: панель на `/__vkma/`, OTP-гейт при первом подключении. Соединение переживает рестарты dev-сервера, история не теряется.

Всё остальное — то же, что у [Vite-плагина](/devtools/vite/):

- **Панель `/__vkma/`** с теми же данными ([обзор](/devtools/panel/)).
- **Перехват `@vkontakte/vk-bridge` → `@vkma.dev/bridge`** для всего графа модулей.
- **FAB** на странице приложения с теми же положениями.
- **[MCP-роут](/devtools/mcp/)** с теми же режимами доверия.

## Опции

```ts
vkmaDevtoolsRsbuild({
    base: "/__vkma/",
    alias: true,
    fabPosition: "bottom-left",
    mcp: false,
    allowedOrigins: false,
});
```

| Опция            | Тип                                               | По умолчанию    | Что делает                                                                                                 |
| ---------------- | ------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------- |
| `base`           | `string`                                          | `"/__vkma/"`    | База панели, RPC-моста и MCP-роута                                                                         |
| `alias`          | `boolean`                                         | `true`          | Подмена импортов `@vkontakte/vk-bridge`; `false` — если приложение импортирует `@vkma.dev/bridge` напрямую |
| `fabPosition`    | `"bottom-left"` \| `"bottom"` \| `"bottom-right"` | `"bottom-left"` | Начальное место FAB; выбор из панели запоминается на origin и побеждает                                    |
| `mcp`            | `boolean` или объект `McpRouteOptions`            | `false`         | MCP-инструменты на `<base>__mcp`                                                                           |
| `allowedOrigins` | `false` или список origin'ов                      | `false`         | Проверка `Origin` у WebSocket-соединений                                                                   |

Отличия от Vite-версии: нет `hub` (дока Vite DevTools) и нет `bridge` (тонкая настройка RPC). Перехват моста применяется только к bundler-чейну rspack.

## Дальше

- [Панель](/devtools/panel/) — timeline, execute, клиенты.
- [MCP](/devtools/mcp/) — трафик моста и execute для кодинг-агентов.
