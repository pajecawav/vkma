---
title: "Расширение каталога"
description: "Аугментация трёх мап через declare module: свои методы, push-события и правила мержинга."
sidebar:
    order: 1
---

Каталог событий — интерфейсы в корне `@vkma.dev/bridge-schema`, расширяй их через `declare module` без форков пакета.

## Куда положить объявление

Создай ambient `.d.ts` внутри include твоего `tsconfig`, например `src/bridge-catalogue.d.ts`:

```ts
// src/bridge-catalogue.d.ts
declare module "@vkma.dev/bridge-schema" {
    interface RequestPropsMap {
        MyAppBackendCall: {
            path: string;
            body?: Record<string, unknown>;
        };
    }
    interface ReceiveDataMap {
        MyAppBackendCall: { status: number; payload: unknown };
    }
    interface ReceiveEventMap {
        MyAppBackendCall: {
            result: "MyAppBackendCallResult";
            failed: "MyAppBackendCallFailed";
        };
    }
}
```

## Что делает каждая мапа

| Мапа              | Ключ                       | Что даёт                                               |
| ----------------- | -------------------------- | ------------------------------------------------------ |
| `RequestPropsMap` | Имя метода                 | Типизирует props и делает имя отправляемым в `send`    |
| `ReceiveDataMap`  | Имя метода или имя события | Типизирует ответ `send` и данные события в `subscribe` |
| `ReceiveEventMap` | Имя метода                 | Проводка: имена событий `Result` и `Failed` для метода |

Ключ `ReceiveDataMap` зависит от характера события. Для метода с ответом — имя метода, как у встроенного `VKWebAppGetUserInfo: UserInfo`: именно по нему `send` резолвит тип ответа. Для события без запросной стороны — само имя события.

Пример выше — метод с ответом: мини-апп живёт в нестандартном хосте (собственная обёртка, dev-заглушка) и вызывает свой `MyAppBackendCall`, хост отвечает `MyAppBackendCallResult` / `MyAppBackendCallFailed`.

## Push-событие без запроса

Хост сообщает сам, без `send`. Добавь одну запись в `ReceiveDataMap`:

```ts
declare module "@vkma.dev/bridge-schema" {
    interface ReceiveDataMap {
        MyAppSyncUpdate: { revision: number };
    }
}
```

Теперь оно сужается в `subscribe`:

```ts
bridge.subscribe(event => {
    if (event.detail.type === "MyAppSyncUpdate") {
        // event.detail.data.revision: number
    }
});
```

## Что получает send

После аугментации из первого примера вызов полностью типизирован через [`@vkma.dev/bridge`](/bridge/):

```ts
const response = await bridge.send("MyAppBackendCall", {
    path: "/counter",
    body: { id: 1 },
});
// response: { status: number; payload: unknown }

try {
    await bridge.send("MyAppBackendCall", { path: "/boom" });
} catch (failed) {
    // тело MyAppBackendCallFailed — реджект как у любого Failed
}
```

Имена — обычные строковые литералы, каталог не валидирует схему именования. Держи конвенцию `…Result` / `…Failed` для парных событий: на неё опирается проводка в `ReceiveEventMap`.

## Правила

- Цель аугментации — корень `@vkma.dev/bridge-schema`. Declaration merging работает только против модуля, объявляющего интерфейсы; `@vkma.dev/bridge` лишь реэкспортирует мапы. `declare module "@vkma.dev/bridge"` не смержится.
- Только расширение. TS interface merging не меняет и не удаляет существующие члены. Правка встроенного каталога (VK поменял payload) — релиз схемы с новой версией, не аугментация.

Если сырой JSON-документ каталога нужен в рантайме, см. [каталог как данные](/bridge-schema/data/).
