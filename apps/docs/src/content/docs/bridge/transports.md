---
title: "Транспорты"
description: "vk-connect конверт, Android/iOS/RN WebView и ленивое чтение хоста при каждом вызове."
sidebar:
    order: 5
---

Мост выбирает транспорт на каждый вызов, в порядке: Android, iOS, React Native, web.

## Исходящие

| Платформа            | Детект                                        | Вызов                                                             |
| -------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| Android WebView      | `window.AndroidBridge`                        | `AndroidBridge[method](JSON.stringify(props))`                    |
| iOS WebView          | `window.webkit.messageHandlers.VKWebAppClose` | `webkit.messageHandlers[method].postMessage(props)`               |
| React Native         | `window.ReactNativeWebView.postMessage`       | `postMessage(JSON.stringify({ handler: method, params: props }))` |
| Web (iframe в хосте) | всё остальное при наличии `window`            | `parent.postMessage(конверт, "*")`                                |

Форма web-конверта — часть платформенного контракта:

```ts
parent.postMessage(
    {
        handler: "VKWebAppGetUserInfo",
        params: { request_id: "__vkma_1" },
        type: "vk-connect",
        webFrameId: "frame-1", // назначает хост, см. ниже
        connectVersion: "0.1.0", // версия из createVKBridge
    },
    "*",
);
```

`targetOrigin` всегда `"*"`: мини-апп не знает origin хоста заранее (vk.ru, m.vk.ru, мобильные клиенты).

## Входящие

- Web: событие `message` на `window`, тело — `{ type, data, frameId }`.
- Android и iOS WebView: нативный слой диспатчит готовые `CustomEvent("VKWebAppEvent")` на `window`.
- React Native на Android: `message` на `document`; RN присылает JSON-строку. Мост парсит её и дальше обрабатывает как web-конверт.

Событие `VKWebAppSettings` — внутренний протокол: хост назначает iframe его `webFrameId`, мост запоминает и кладёт в каждый исходящий конверт. Подписчикам оно не доставляется.

## Ленивое чтение хоста

Транспорты читают `window.AndroidBridge` / `webkit.messageHandlers` / `parent` при каждом вызове, а не кэшируют на импорте: фейковый хост можно подменить в юнит-тесте в любой момент, и мост подхватит его следующим вызовом.

## supportsAsync

Проверка поддержки метода зависит от окружения:

- Android и iOS WebView — синхронный опрос нативных объектов: есть `AndroidBridge[method]` или `messageHandlers[method]` — метод поддерживается.
- Web — мост один раз шлёт `SetSupportedHandlers` и кэширует ответ; повторные pushes `SetSupportedHandlers` от хоста обновляют кэш. При ошибке или пустом ответе fallback — набор из одного `VKWebAppInit`.

```ts
if (await bridge.supportsAsync("VKWebAppShowStoryBox")) {
    await bridge.send("VKWebAppShowStoryBox", props);
}
```

## Окружение

Семейство синхронных проверок на инстансе:

- `isWebView()` — iOS или Android WebView;
- `isIframe()` — `window.parent !== window`;
- `isEmbedded()` — вебвью или iframe, т.е. приложение живёт в хосте;
- `isStandalone()` — наоборот: открыто вне хоста.

Проверки окружения не заменяют `supportsAsync`: метод может быть поддержан на платформе, но недоступен в конкретном клиенте.
