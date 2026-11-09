---
title: "Инстансы и request_id"
description: "Дефолтный синглтон, createVKBridge для изолированных инстансов и политика request_id."
sidebar:
    order: 3
---

Дефолтный экспорт пакета — один инстанс на страницу. Для всего остального есть `createVKBridge`.

## Инстанс по умолчанию

```ts
import bridge, { bridgeTap, onEvent, onSend } from "@vkma.dev/bridge";
```

Он публикует devtools-хэндл на `globalThis` (см. [tap](/bridge/tap/)) и разделяет свой tap с каждой копией пакета на странице. Для большинства мини-аппов этого достаточно.

## createVKBridge

```ts
import { createVKBridge } from "@vkma.dev/bridge";

const bridge = createVKBridge("1.0.0", {
    requestId: { generator: sequence => `req-${sequence}` },
});
```

Первый аргумент — строка версии: web-транспорт кладёт её в конверт как `connectVersion`, хост видит, какой мост с ним говорит. Опции:

| Опция                 | Тип                                      | Значение                                         |
| --------------------- | ---------------------------------------- | ------------------------------------------------ |
| `requestId.generator` | `(sequence: number) => string \| number` | Своя схема исходящих id; sequence начинается с 1 |
| `requestId.inject`    | `boolean`                                | Авто-инъекция `request_id`; по умолчанию `true`  |
| `tap`                 | `BridgeTap`                              | Чужой tap, если нужно делиться потоком событий   |

У каждого инстанса свои подписчики и свои пары запрос/ответ: два инстанса не путают ответы между собой, даже вися на одной странице.

## Политика request_id

По умолчанию каждый `send` без явного `request_id` в props получает авто-инъекцию `__vkma_<n>` — именно на этом работает [паринг ответов](/bridge/events/). Два рычага:

`generator` — своя схема, когда хост или бэкенд ждут определённый формат id:

```ts
const bridge = createVKBridge("1.0.0", {
    requestId: { generator: sequence => `app-${Date.now()}-${sequence}` },
});
```

`inject: false` — props уходят нетронутыми. Паринг продолжит работать для вызовов, которые передают свой `request_id` сами; вызов без него становится fire-and-forget, но [`timeout` и `signal`](/bridge/send-options/) всё равно его ограничивают:

```ts
const bridge = createVKBridge("1.0.0", { requestId: { inject: false } });

// не спарится: хост должен ответить с этим же request_id
await bridge.send("VKWebAppGetUserInfo", { request_id: "call-42" });
```

Явный `request_id` в props всегда выигрывает у генератора и выключенной инъекции.

## Когда нужен свой инстанс

- Тесты: `createVKBridge` в happy-dom с фейковым `window.parent` — без страницы и глобального хэндла.
- Нестандартный хост со своими требованиями к `request_id` — свой `generator`.
- Изоляция: трафик инстанса не попадает в общий tap и в [devtools](/devtools/), пока ты не передашь `tap: bridgeTap` из корневого модуля, чтобы поделиться потоком.

Свежесозданный инстанс получает собственный tap с буфером на 500 событий; менять его размер нельзя — но можно собрать свой через `createTap(limit)` и передать в опции.
