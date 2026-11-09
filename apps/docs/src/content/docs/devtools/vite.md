---
title: "Vite-плагин"
description: "vkmaDevtools в vite.config: панель /__vkma/, алиас моста и FAB одной строкой."
sidebar:
    order: 1
---

Установи devtools, [мост](/bridge/) и Vite-адаптер devframe:

```sh
npm install -D @vkma.dev/devtools @vkma.dev/bridge devframe @devframes/vite
```

Добавь плагин в `vite.config.ts`:

```ts
import { vkmaDevtools } from "@vkma.dev/devtools";

export default {
    plugins: [vkmaDevtools()],
};
```

Запусти `vite dev` — рядом с адресом приложения терминал печатает `vkma devtools → http://localhost:5173/__vkma/`. Что внутри панели — в [обзоре](/devtools/panel/).

## Что делает плагин

- **Панель `/__vkma/`.** SPA с RPC/WebSocket на порту самого Vite, как `/__unocss` у UnoCSS. Отдельный сервер не поднимается. `/__vkma` без слеша редиректится (308) на `/__vkma/`.
- **Алиас моста.** Импорты `@vkontakte/vk-bridge` — в том числе из зависимостей — ведут на `@vkma.dev/bridge` с встроенным tap'ом: весь трафик приложения виден панели, код приложения менять не нужно.
- **FAB.** Плавающая кнопка на странице приложения открывает ту же панель оверлеем.

## Опции

```ts
vkmaDevtools({
    base: "/__vkma/",
    alias: true,
    fabPosition: "bottom-left",
    mcp: false,
    allowedOrigins: false,
    hub: false,
});
```

| Опция            | Тип                                               | По умолчанию    | Что делает                                                                                              |
| ---------------- | ------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `base`           | `string`                                          | `"/__vkma/"`    | База панели, RPC-моста и [MCP-роута](/devtools/mcp/)                                                    |
| `alias`          | `boolean`                                         | `true`          | Алиас `@vkontakte/vk-bridge` → `@vkma.dev/bridge` в dev-сборке                                          |
| `fabPosition`    | `"bottom-left"` \| `"bottom"` \| `"bottom-right"` | `"bottom-left"` | Начальное место FAB; выбор, сделанный в панели, запоминается на origin и побеждает это значение         |
| `mcp`            | `boolean` или объект `McpRouteOptions`            | `false`         | [MCP-инструменты](/devtools/mcp/) на `<base>__mcp` для кодинг-агентов                                   |
| `allowedOrigins` | `false` или список origin'ов                      | `false`         | Проверка `Origin` у WebSocket-соединений; `false` — любой origin (граница доверия — OTP-гейт, см. ниже) |
| `hub`            | `boolean`                                         | `false`         | Панель доком в [Vite DevTools](#vite-devtools-dock) вместо отдельной страницы                           |
| `bridge`         | объект                                            | —               | Дополнительные опции RPC-моста; пробрасываются в `devframeViteBridge` как есть                          |

Плагин работает только в dev (`apply: "serve"`) — прод-сборку он не трогает.

## Прямой импорт @vkma.dev/bridge

Если приложение импортирует `@vkma.dev/bridge` напрямую, алиас не нужен — пакет сам публикует tap, и коллектор его найдёт. Отключи перехват:

```ts
vkmaDevtools({ alias: false });
```

Алиас нужен ровно для одного: чтобы `@vkontakte/vk-bridge` в чужом коде тоже шёл через tap.

## Телефон и туннели

Запусти `vite --host` и открой приложение с телефона по LAN — он станет ещё одним клиентом панели. Первое подключение браузера проходит через OTP-гейт: одноразовый код печатается в терминале dev-сервера (рядом — ссылка одного клика), доверенные браузеры запоминаются. Проверка `Origin` у WebSocket по умолчанию открыта — границей доверия остаётся OTP; передай `allowedOrigins: ["http://192.168.1.5:5173"]`, чтобы закрыть и её.

## Vite DevTools dock

С установленным [`@vitejs/devtools`](https://devtools.vite.dev/) панель можно вмонтировать доком вместо отдельной страницы:

```ts
import { DevTools } from "@vitejs/devtools";
import { vkmaDevtools } from "@vkma.dev/devtools";

export default {
    plugins: [DevTools(), vkmaDevtools({ hub: true })],
};
```

Хаб берёт на себя панель и RPC, плагин — перехват моста и FAB. [MCP](/devtools/mcp/) агрегируется в эндпоинт хаба `/__devtools/__mcp`, опция `mcp` игнорируется. Без `hub: true` ничего не меняется — с Vite DevTools или без него.

## Дальше

- [Панель](/devtools/panel/) — timeline, execute, клиенты.
- [MCP](/devtools/mcp/) — трафик моста и execute для кодинг-агентов.
