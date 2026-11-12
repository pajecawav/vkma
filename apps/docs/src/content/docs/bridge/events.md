---
title: "События VK Bridge: send, subscribe и связывание ответов"
description: "Как send парит ответы по request_id и как подписываться на события хоста."
sidebar:
    order: 1
    label: "События и подписки"
---

`send` — это запрос-ответ: ты вызываешь метод, хост отвечает событием `Result` или `Failed`. `subscribe` — поток входящих: всё, что хост присылает, включая ответы на `send`.

## send

```ts
import bridge from "@vkma.dev/bridge";

await bridge.send("VKWebAppInit");
const user = await bridge.send("VKWebAppGetUserInfo");
// user: UserInfo — id, first_name, photo_100, …
```

Типы приходят из каталога [`@vkma.dev/bridge-schema`](/bridge-schema/): props берутся из `RequestPropsMap`, ответ — из `ReceiveDataMap`. Метод без ответной стороны в каталоге (например, `VKWebAppLibverifyCheck`) резолвится как `Promise<void>`.

## Как парится ответ

Каждый `send` получает `request_id`. По умолчанию инстанс инъектирует его сам: `__vkma_1`, `__vkma_2`, … Когда хост присылает событие с `request_id`, для которого есть ожидание:

- `request_id` вырезается из полезной нагрузки, и промис резолвится телом без него;
- событие с `error_type` реджектит промис этим же телом (тоже без `request_id`).

Передай свой `request_id` в props, если он нужен для логики на стороне хоста. Политика инстанса явный идентификатор не трогает:

```ts
await bridge.send("VKWebAppGetUserInfo", { request_id: "sync-1" });
```

Ответ без `request_id` (или с чужим) — это событие, а не ответ: промисы не трогаются.

## Ошибки

Реджект — не `Error`, а тело `Failed`-события. Дискриминируй по `error_type`:

```ts
import type { ErrorData } from "@vkma.dev/bridge";

try {
    await bridge.send("VKWebAppGetUserInfo");
} catch (failed) {
    const data = failed as ErrorData;
    switch (data.error_type) {
        case "client_error": // data.error_data.error_reason
            break;
        case "api_error": // data.error_data.error_msg, error_code
            break;
        case "auth_error": // data.error_data.error_reason
            break;
    }
}
```

Если ответ не пришёл вообще, промис висит вечно. Навеси [`timeout` или `signal`](/bridge/send-options/).

## subscribe

Каждое входящее событие, включая ответы на `send`. Формат — `event.detail.type` / `event.detail.data`, данные приходят как есть, с `request_id`:

```ts
const off = bridge.subscribe(event => {
    switch (event.detail.type) {
        case "VKWebAppUpdateConfig":
            // event.detail.data.appearance: "light" | "dark"
            break;
        case "VKWebAppLocationChanged":
            // event.detail.data.location: string
            break;
    }
});

off(); // отписка
```

`subscribe` возвращает функцию отписки; есть и классический `bridge.unsubscribe(listener)`. Хендлер может отписываться прямо внутри вызова.

## Что чем обрабатывать

- Нужен ответ — `send`: `VKWebAppGetUserInfo`, `VKWebAppStorageGet`, `VKWebAppShowWallPostBox` (промис резолвится, когда пользователь закрыл бокс).
- Хост сообщает сам — `subscribe`: `VKWebAppUpdateConfig`, `VKWebAppLocationChanged`, `VKWebAppAudioPaused`, `VKWebAppUpdateInsets`.

Ответы приедут и в `subscribe`, независимо от паринга. Если пишешь общий обработчик, отфильтруй полезные нагрузки с `request_id`.

Что происходит с каждым событием по пути, видно в [tap](/bridge/tap/). Он пишет и запросы, и ответы, и события.
