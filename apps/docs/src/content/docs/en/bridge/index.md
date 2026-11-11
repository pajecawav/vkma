---
title: bridge
description: "An independent VK Bridge: the classic API, per-send timeouts and a built-in tap."
sidebar:
    order: 0
    label: "Overview"
---

`@vkma.dev/bridge` is an independent VK Bridge for VK Mini Apps. The classic API (`send` / `subscribe` / `supportsAsync` / …) plus a built-in observability tap, per-send timeout/abort and a configurable `request_id` policy.

Types come from [`@vkma.dev/bridge-schema`](/en/bridge-schema/), the catalogue of every platform event as data, with an open interface for your own events.

```sh
npm install @vkma.dev/bridge
```

## Use

```ts
import bridge from "@vkma.dev/bridge";

await bridge.send("VKWebAppInit");
const user = await bridge.send("VKWebAppGetUserInfo");

// every classic subscribe returns its own unsubscribe function
const off = bridge.subscribe(event => {
    // event.detail.type / event.detail.data, every event from the host
});
```

Or build isolated instances (own tap, own pairing state):

```ts
import { createVKBridge } from "@vkma.dev/bridge";

const bridge = createVKBridge("1.0.0", {
    // the version string is reported to the web host
    requestId: { generator: sequence => `req-${sequence}` },
});
```

## Beyond the classic API

Everything lives on the instance, no extra imports:

```ts
// Every outgoing send / incoming event, always on, replayed to late subscribers
const off = bridge.onSend(event => log(event.name, event.payload));
const off2 = bridge.onEvent(event => log(event.name, event.ok));

// Per-send controls
await bridge.send("VKWebAppGetUserInfo", undefined, { timeout: 5000 });
await bridge.send("VKWebAppShowWallPostBox", props, { signal: controller.signal });

// request_id policy (default: auto-inject __vkma_<n>, that's what pairing uses)
createVKBridge("1.0.0", { requestId: { inject: false } });
```

Importing the package is enough for [devtools](/en/devtools/) to see the bridge traffic: the default instance publishes a handle on `globalThis.__vkmaDevtoolsBridge` (details in [the tap](/en/bridge/tap/)).

## Types and custom events

All payload types and the three catalogue maps are re-exported here. To teach the bridge your own (or your proxy backend's) events, extend the schema package, and `send`, `subscribe` and every consumer of the types pick it up:

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

The rules live in [`@vkma.dev/bridge-schema`](/en/bridge-schema/). Augment that package's root, extending it rather than overriding it.

## Transports

Web (iframe `postMessage` with the `vk-connect` envelope), Android WebView, iOS WebView and React Native WebView, with receive-side `message` / `VKWebAppEvent` listeners to match.

## Learn more

- [Events and subscriptions](/en/bridge/events/) — response pairing, errors, subscribe
- [Timeouts and cancellation](/en/bridge/send-options/) — timeout, AbortSignal, retries
- [Instances and request_id](/en/bridge/instances/) — createVKBridge and isolation
- [The tap and devtools](/en/bridge/tap/) — onSend/onEvent and the replay buffer
- [Transports](/en/bridge/transports/) — the vk-connect envelope, WebViews, supportsAsync

## Links

- [npm: @vkma.dev/bridge](https://www.npmjs.com/package/@vkma.dev/bridge)
