---
title: bridge
description: "Независимый VK Bridge: классический API, таймауты на каждый send и встроенный tap."
sidebar:
    order: 0
    label: "Описание"
---

`@vkma.dev/bridge` — независимый VK Bridge для VK Mini Apps. Классический API (`send` / `subscribe` / `supportsAsync` / …), встроенный observability-tap, таймаут и abort на каждый send и настраиваемая политика `request_id`.

Типы приходят из [`@vkma.dev/bridge-schema`](/bridge-schema/). Это каталог всех событий платформы как данные, с открытым интерфейсом для собственных событий.

```sh
npm install @vkma.dev/bridge
# или: pnpm add / yarn add / bun add
```

## Использование

```ts
import bridge from "@vkma.dev/bridge";

await bridge.send("VKWebAppInit");
const user = await bridge.send("VKWebAppGetUserInfo");

// каждый subscribe возвращает свою функцию отписки
const off = bridge.subscribe(event => {
    // event.detail.type / event.detail.data, каждое событие от хоста
});
```

Или собирай изолированные инстансы (свой tap, своё состояние pairing'а):

```ts
import { createVKBridge } from "@vkma.dev/bridge";

const bridge = createVKBridge("1.0.0", {
    // строка версии сообщается web-хосту
    requestId: { generator: sequence => `req-${sequence}` },
});
```

## Сверх классического API

Всё живёт на инстансе, без лишних импортов:

```ts
// каждый исходящий send и входящее событие, всегда включены,
// replay для опоздавших подписчиков
const off = bridge.onSend(event => log(event.name, event.payload));
const off2 = bridge.onEvent(event => log(event.name, event.ok));

// контроль на каждый send
await bridge.send("VKWebAppGetUserInfo", undefined, { timeout: 5000 });
await bridge.send("VKWebAppShowWallPostBox", props, { signal: controller.signal });

// политика request_id (по умолчанию: авто-инъекция __vkma_<n>,
// именно на ней работает pairing ответов)
createVKBridge("1.0.0", { requestId: { inject: false } });
```

Импорта пакета достаточно, чтобы [devtools](/devtools/) видел трафик моста: инстанс по умолчанию публикует хэндл на `globalThis.__vkmaDevtoolsBridge` (подробности в [tap](/bridge/tap/)).

## Типы и кастомные события

Все типы полезных нагрузок и три каталога-мапы реэкспортируются здесь. Чтобы научить мост своим событиям (или событиям прокси-бэкенда), расширяй schema-пакет, и `send`, `subscribe` и все потребители типов подхватят:

```ts
declare module "@vkma.dev/bridge-schema" {
    interface RequestPropsMap {
        VKWebAppMyCustomMethod: { foo: string };
    }
    interface ReceiveDataMap {
        VKWebAppMyCustomMethodResult: { bar: number };
    }
    interface ReceiveEventMap {
        VKWebAppMyCustomMethod: {
            result: "VKWebAppMyCustomMethodResult";
            failed: "VKWebAppMyCustomMethodFailed";
        };
    }
}
```

Правила живут в [`@vkma.dev/bridge-schema`](/bridge-schema/). Аугментируй корень schema-пакета, расширяй, но не переопределяй.

## Транспорты

Web (iframe `postMessage` с конвертом `vk-connect`), Android WebView, iOS WebView и React Native WebView. Входящие листенеры — `message` / `VKWebAppEvent`, детали ниже.

## Подробнее

- [События и подписки](/bridge/events/) — паринг ответов, ошибки, subscribe
- [Таймауты и отмена](/bridge/send-options/) — timeout, AbortSignal, повторы
- [Инстансы и request_id](/bridge/instances/) — createVKBridge и изоляция
- [Tap и devtools](/bridge/tap/) — onSend/onEvent и replay-буфер
- [Транспорты](/bridge/transports/) — vk-connect конверт, WebView'ы, supportsAsync

## Ссылки

- [npm: @vkma.dev/bridge](https://www.npmjs.com/package/@vkma.dev/bridge)
