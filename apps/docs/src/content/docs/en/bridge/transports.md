---
title: "VK Bridge transports: WebView, postMessage, vk-connect"
description: "The vk-connect envelope, Android/iOS/RN WebViews and lazy per-call host detection."
sidebar:
    order: 5
    label: "Transports"
---

The bridge picks a transport per call, in order: Android, iOS, React Native, web.

## Outgoing

| Platform               | Detection                                     | Call                                                              |
| ---------------------- | --------------------------------------------- | ----------------------------------------------------------------- |
| Android WebView        | `window.AndroidBridge`                        | `AndroidBridge[method](JSON.stringify(props))`                    |
| iOS WebView            | `window.webkit.messageHandlers.VKWebAppClose` | `webkit.messageHandlers[method].postMessage(props)`               |
| React Native           | `window.ReactNativeWebView.postMessage`       | `postMessage(JSON.stringify({ handler: method, params: props }))` |
| Web (iframe in a host) | anything else, given a `window`               | `parent.postMessage(envelope, "*")`                               |

The web envelope's shape is part of the platform contract:

```ts
parent.postMessage(
    {
        handler: "VKWebAppGetUserInfo",
        params: { request_id: "__vkma_1" },
        type: "vk-connect",
        webFrameId: "frame-1", // assigned by the host, see below
        connectVersion: "0.1.0", // the version from createVKBridge
    },
    "*",
);
```

The `"*"` targetOrigin is constant: a mini app cannot know the host origin ahead of time (vk.ru, m.vk.ru, mobile clients).

## Incoming

- Web: the `message` event on `window`, body `{ type, data, frameId }`.
- Android and iOS WebViews: the native layer dispatches ready-made `CustomEvent("VKWebAppEvent")` on `window`.
- React Native on Android: `message` on `document`; RN delivers a JSON string. The bridge parses it and processes it like a web envelope.

The `VKWebAppSettings` event is internal protocol: the host assigns the iframe its `webFrameId`, the bridge remembers it and puts it into every outgoing envelope. It is never delivered to subscribers.

## Lazy host detection

Transports read `window.AndroidBridge` / `webkit.messageHandlers` / `parent` on every call instead of caching them at import time: a fake host can be installed at any point in a unit test, and the next call picks it up.

## supportsAsync

Support detection depends on the environment:

- Android and iOS WebViews probe the native objects synchronously: an `AndroidBridge[method]` or `messageHandlers[method]` that exists means the method is supported.
- Web sends `SetSupportedHandlers` once and caches the answer; repeat `SetSupportedHandlers` pushes from the host refresh the cache. On error or an empty answer the fallback is a set of one: `VKWebAppInit`.

```ts
if (await bridge.supportsAsync("VKWebAppShowStoryBox")) {
    await bridge.send("VKWebAppShowStoryBox", props);
}
```

## Environment

A family of synchronous checks on the instance:

- `isWebView()` — iOS or Android WebView;
- `isIframe()` — `window.parent !== window`;
- `isEmbedded()` — webview or iframe, i.e. the app runs inside a host;
- `isStandalone()` — the opposite: opened outside any host.

Environment checks do not replace `supportsAsync`: a method can exist on the platform yet be unavailable in a particular client.
