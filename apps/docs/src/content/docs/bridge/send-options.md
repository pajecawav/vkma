---
title: "Параметры send: таймауты и отмена через AbortSignal"
description: "Третий аргумент send: timeout, AbortSignal и что происходит с опоздавшим ответом."
sidebar:
    order: 2
    label: "Таймауты и отмена"
---

Третий аргумент `send` ограничивает ожидание ответа. Без него промис, на который хост не ответил, не завершается никогда.

```ts
import bridge from "@vkma.dev/bridge";

await bridge.send("VKWebAppGetUserInfo", undefined, {
    timeout: 5000,
    signal: controller.signal,
});
```

## Опции

| Опция     | Тип           | Эффект                                 |
| --------- | ------------- | -------------------------------------- |
| `timeout` | `number`      | Реджект через N миллисекунд без ответа |
| `signal`  | `AbortSignal` | Реджект в момент `abort()`             |

Обе опции независимы, работают вместе или по одной.

## timeout

Реджект — `Error` с именем `TimeoutError` и сообщением вида `VK Bridge send "VKWebAppGetUserInfo" timed out after 5000ms`:

```ts
try {
    await bridge.send("VKWebAppGetUserInfo", undefined, { timeout: 5000 });
} catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
        // хост не ответил за 5 секунд
    }
}
```

## signal

Отмена через `AbortController` покрывает закрытие бокса, уход с экрана, потерю сети:

```ts
const controller = new AbortController();
const user = bridge.send("VKWebAppGetUserInfo", undefined, { signal: controller.signal });
controller.abort(); // промис реджектится сразу
```

Реджект — `Error` с именем `AbortError`. Уже абортнутый сигнал отклоняет вызов до отправки: ни записи в транспорт, ни записи в [tap](/bridge/tap/). Вызова как бы не было.

## Опоздавший ответ

`timeout` и `abort` срабатывают даже для непарных вызовов (например, [`inject: false`](/bridge/instances/) без своего `request_id`). После реджекта слот ожидания свободен: когда ответ всё же приезжает, промис уже завершён, и ответ приходит как обычное событие, в `subscribe` и в tap с `kind: "event"`. Двойного реджекта не будет.

## Повторы

Встроенных retry нет. Промис заканчивается на первом исходе. Оберни сам:

```ts
import bridge, { type UserInfo } from "@vkma.dev/bridge";

async function getUserInfoWithRetry(attempts = 2): Promise<UserInfo> {
    for (let i = 0; i <= attempts; i++) {
        try {
            return await bridge.send("VKWebAppGetUserInfo", undefined, { timeout: 3000 });
        } catch (error) {
            if (i === attempts || (error instanceof Error && error.name === "AbortError")) {
                throw error;
            }
        }
    }
    throw new Error("unreachable");
}
```

Учитывай, что хост мог получить и выполнить первый вызов. Повтор выполняет метод повторно. Для неидемпотентных методов (платежи, посты) решай на стороне хоста, а не повторами.
