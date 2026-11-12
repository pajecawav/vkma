---
title: "Tap моста: onSend, onEvent и replay-буфер"
description: "onSend и onEvent, replay-буфер на 500 событий и контракт globalThis.__vkmaDevtoolsBridge."
sidebar:
    order: 4
    label: "Tap и devtools"
---

Каждый инстанс моста пишет всё, что через него проходит, в tap, всегда включённый поток исходящих `send`, парных ответов и событий хоста.

## onSend и onEvent

```ts
import bridge from "@vkma.dev/bridge";

const offSend = bridge.onSend(event => {
    // каждый исходящий вызов
    console.log(event.name, event.payload);
});

const offEvents = bridge.onEvent(event => {
    // всё входящее: ответы (kind: "response") и события (kind: "event")
    console.log(event.kind, event.name, event.ok);
});
```

Обе возвращают функцию отписки. Для дефолтного инстанса те же подписки доступны модульными функциями `onSend` / `onEvent` из корня пакета.

## События tap

Каждое событие — `BridgeTapEvent`:

| Поле        | Значение                                                              |
| ----------- | --------------------------------------------------------------------- |
| `id`        | Монотонный счётчик с загрузки страницы; парит `response` с его `send` |
| `ts`        | `Date.now()` в момент события                                         |
| `direction` | `"out"` — приложение вызвало send; `"in"` — хост что-то прислал       |
| `kind`      | `"send"` (out), `"response"` (in, парный), `"event"` (in, без пары)   |
| `name`      | Имя метода или события                                                |
| `payload`   | Полезная нагрузка; у парного ответа уже без `request_id`              |
| `reqId`     | У `response`: `id` исходного `send`                                   |
| `ok`        | У `response`: зарезолвился промис или реджектнулся                    |

Ответ с `error_type` — это `response` с `ok: false`, а не отдельный вид события.

Полезная нагрузка после эмита не мутируется. Подписчик видит снапшот на момент события.

## Replay-буфер

До первого подписчика tap копит события в буфере (по умолчанию 500, при переполнении голова выпадает). Первый подписчик получает весь буфер старыми-вперёд, дальше события идут живьём. Подписчик может опоздать без потерь: коллектор devtools подгружается и после того, как приложение уже шлёт.

```ts
const buffered = bridge.tap.drain(); // что накопилось до подписок, старые вперёд
```

Буфер одноразовый: после первой подписки tap живёт только живыми доставками, `drain()` возвращает пусто.

## createTap

Tap — самостоятельный хаб без зависимости от моста. Собери свой с другим лимитом и передай инстансу:

```ts
import { bridgeTap, createTap, createVKBridge } from "@vkma.dev/bridge";

const ownTap = createTap(100);
const bridge = createVKBridge("1.0.0", { tap: ownTap });
// или вливай трафик нового инстанса в общий tap:
const visible = createVKBridge("1.0.0", { tap: bridgeTap });
```

## Контракт devtools

Импорт пакета публикует на `globalThis.__vkmaDevtoolsBridge` хэндл `{ tap, send }`:

- `tap` — общий tap дефолтного инстанса;
- `send(name, params)` — выполнить вызов внутри приложения: так работает execute в [devtools](/devtools/).

Первая копия модуля на странице создаёт хэндл, остальные переиспользуют её tap. Дубликаты пакета в бандле не плодят буферы. Инстансы из `createVKBridge` глобальный хэндл не публикуют.
