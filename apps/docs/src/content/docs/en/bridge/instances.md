---
title: "createVKBridge: instances and the request_id policy"
description: "The default singleton, createVKBridge for isolated instances and the request_id policy."
sidebar:
    order: 3
    label: "Instances and request_id"
---

The package's default export is one instance per page. Everything else is `createVKBridge`.

## The default instance

```ts
import bridge, { bridgeTap, onEvent, onSend } from "@vkma.dev/bridge";
```

It publishes the devtools handle on `globalThis` (see [the tap](/en/bridge/tap/)) and shares its tap with every copy of the package on the page. For most mini apps this is all you need.

## createVKBridge

```ts
import { createVKBridge } from "@vkma.dev/bridge";

const bridge = createVKBridge("1.0.0", {
    requestId: { generator: sequence => `req-${sequence}` },
});
```

The first argument is a version string: the web transport puts it into the envelope as `connectVersion`, so the host sees which bridge it is talking to. Options:

| Option                | Type                                     | Meaning                                               |
| --------------------- | ---------------------------------------- | ----------------------------------------------------- |
| `requestId.generator` | `(sequence: number) => string \| number` | Own scheme for outgoing ids; the sequence starts at 1 |
| `requestId.inject`    | `boolean`                                | Auto-injection of `request_id`; default `true`        |
| `tap`                 | `BridgeTap`                              | A foreign tap, when the event stream should be shared |

Each instance keeps its own subscribers and its own request/response pairs: two instances never mix up each other's responses, even on the same page.

## The request_id policy

By default every `send` without an explicit `request_id` in props gets `__vkma_<n>` injected. That is what [response pairing](/en/bridge/events/) runs on. Two knobs:

`generator` — your own scheme, when the host or a backend expects a specific id format:

```ts
const bridge = createVKBridge("1.0.0", {
    requestId: { generator: sequence => `app-${Date.now()}-${sequence}` },
});
```

`inject: false` — props pass through untouched. Pairing keeps working for calls that provide their own `request_id`; a call without one becomes fire-and-forget, though [`timeout` and `signal`](/en/bridge/send-options/) still bound it:

```ts
const bridge = createVKBridge("1.0.0", { requestId: { inject: false } });

// pairs only if the host echoes this request_id back
await bridge.send("VKWebAppGetUserInfo", { request_id: "call-42" });
```

An explicit `request_id` in props always wins over the generator and over disabled injection.

## When you need your own instance

- Tests: `createVKBridge` in happy-dom against a fake `window.parent` — no page, no global handle.
- A non-standard host with its own `request_id` requirements — your own `generator`.
- Isolation: the instance's traffic stays out of the shared tap and of [devtools](/en/devtools/) until you pass `tap: bridgeTap` from the root module to share the stream.

A fresh instance gets its own tap with a 500-event buffer; the size is not configurable on the instance, but you can build your own via `createTap(limit)` and pass it in the options.
