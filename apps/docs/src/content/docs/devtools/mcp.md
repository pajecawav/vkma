---
title: "MCP"
description: "Инструменты vkma:mcp-state и vkma:mcp-execute для кодинг-агентов на /__vkma/__mcp."
sidebar:
    order: 4
---

Панель умеет отдавать свои данные кодинг-агентам (OpenCode, Claude Code и любой MCP-клиент) через MCP-сервер на твоём dev-сервере. Роут выключен по умолчанию — включай осознанно:

```ts
vkmaDevtools({ mcp: true }); // или vkmaDevtoolsRsbuild({ mcp: true })
```

Эндпоинт — Streamable HTTP по адресу `<base>__mcp`, по умолчанию `http://localhost:5173/__vkma/__mcp`. Источник данных тот же, что у [панели](/devtools/panel/): агенты видят ровно то, что видишь ты.

## Режимы доверия

Включение `mcp: true` даёт нулевую конфигурацию с двумя гейтами:

1. **Origin обязателен.** Запрос без заголовка `Origin` получает 403; с Origin — он должен быть loopback (`localhost`, `127.0.0.1`, `::1`). Это защита от DNS-rebinding: не-браузерный MCP-клиент обязан послать Origin явно.
2. **Пир — loopback.** Соединение должно прийти с твоей машины (адрес проверяется на сервере, подделать его нельзя).

Для туннелей и LAN расширь доверие объектом вместо `true`:

```ts
vkmaDevtools({
    mcp: {
        allowedOrigins: ["https://my-tunnel.example"], // принять ещё и этот Origin
        authorization: "Bearer <твой-токен>", // проверить личность вызывающего
    },
});
```

- `allowedOrigins` — список принимаемых Origin сверх loopback; `false` выключает проверку Origin целиком (не рекомендуется).
- `authorization` — bearer-токен (или callback), проверяется после origin-гейта: неверный кредшел — 401 с `WWW-Authenticate: Bearer`. Аутентифицированный вызывающий освобождается от loopback-ограничения.

Поля `path` (по умолчанию `__mcp`) меняет сегмент роута, `instructions` добавляет агенту подсказку в `initialize`.

## Подключение агента

В конфиг MCP-клиента добавь сервер с заголовками; `Authorization` нужен только если задан токен:

```json
{
    "mcpServers": {
        "vkma": {
            "url": "http://localhost:5173/__vkma/__mcp",
            "headers": {
                "Origin": "http://localhost:5173",
                "Authorization": "Bearer <твой-токен>"
            }
        }
    }
}
```

## Инструменты

- **`vkma:mcp-state`** (read). Подключённые клиенты (платформа, URL, online) и последние 500 событий моста, новые в конце. Полезные нагрузки санируются до plain JSON.
- **`vkma:mcp-execute`** (action). Выполняет метод VK Bridge на клиенте и ждёт результат round-trip. Вход: `{ "clientId": "…", "name": "VKWebAppGetUserInfo", "params": {} }` — `clientId` и `name` обязательны, id бери из `vkma:mcp-state`. Мутирует состояние работающего приложения.

Типовой сценарий: агент читает `vkma:mcp-state`, находит нужного клиента и воспроизводит или проверяет вызовы через `vkma:mcp-execute`, не открывая браузер.

В [режиме hub](/devtools/vite/#vite-devtools-dock) эндпоинт агрегируется в `/__devtools/__mcp` — опция `mcp` игнорируется.

## Дальше

- [Панель](/devtools/panel/) — те же данные для человека.
- [Vite-плагин](/devtools/vite/) и [Rsbuild-адаптер](/devtools/rsbuild/) — установка.
