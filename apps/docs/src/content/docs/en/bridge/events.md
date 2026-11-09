---
title: "Events and subscriptions"
description: "How send pairs responses by request_id and how to subscribe to host events."
sidebar:
    order: 1
---

`send` is request-response: you call a method, the host answers with a `Result` or `Failed` event. `subscribe` is the incoming stream: everything the host sends, including answers to your `send` calls.

## send

```ts
import bridge from "@vkma.dev/bridge";

await bridge.send("VKWebAppInit");
const user = await bridge.send("VKWebAppGetUserInfo");
// user: UserInfo — id, first_name, photo_100, …
```

Types come from the [`@vkma.dev/bridge-schema`](/en/bridge-schema/) catalogue: props from `RequestPropsMap`, the response from `ReceiveDataMap`. A method with no receive side in the catalogue (e.g. `VKWebAppLibverifyCheck`) resolves as `Promise<void>`.

## How the response is paired

Every `send` gets a `request_id`. By default the instance injects one itself — `__vkma_1`, `__vkma_2`, … When the host sends an event whose `request_id` has a pending entry:

- `request_id` is stripped from the payload — the promise resolves with the body without it;
- an event carrying `error_type` rejects the promise with that same body (also without `request_id`).

Pass your own `request_id` in props when the host side needs it for its own logic — the instance policy never touches an explicit identifier:

```ts
await bridge.send("VKWebAppGetUserInfo", { request_id: "sync-1" });
```

A response without `request_id` (or with a foreign one) is an event, not an answer: promises are left alone.

## Errors

The rejection is not an `Error` — it is the `Failed` event body. Discriminate by `error_type`:

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

If no answer ever arrives, the promise hangs forever — add a [`timeout` or `signal`](/en/bridge/send-options/).

## subscribe

Every incoming event, responses to `send` included. The shape is `event.detail.type` / `event.detail.data`, delivered as-is, `request_id` included:

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

off(); // unsubscribe
```

`subscribe` returns its own unsubscribe function; the classic `bridge.unsubscribe(listener)` exists too. A handler may unsubscribe mid-dispatch.

## Which one to use

- You need an answer — `send`: `VKWebAppGetUserInfo`, `VKWebAppStorageGet`, `VKWebAppShowWallPostBox` (the promise resolves when the user closes the box).
- The host reports on its own — `subscribe`: `VKWebAppUpdateConfig`, `VKWebAppLocationChanged`, `VKWebAppAudioPaused`, `VKWebAppUpdateInsets`.

Responses to your own `send` calls also land in `subscribe` — if you write a global handler, filter out payloads carrying `request_id`.

What happens to every event along the way is visible in the [tap](/en/bridge/tap/) — it records sends, responses and events alike.
