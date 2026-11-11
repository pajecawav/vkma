---
title: "The tap and devtools"
description: "onSend and onEvent, the 500-event replay buffer and the globalThis.__vkmaDevtoolsBridge contract."
sidebar:
    order: 4
---

Every bridge instance writes everything passing through it into a tap, an always-on stream of outgoing `send` calls, paired responses and host events.

## onSend and onEvent

```ts
import bridge from "@vkma.dev/bridge";

const offSend = bridge.onSend(event => {
    // every outgoing call
    console.log(event.name, event.payload);
});

const offEvents = bridge.onEvent(event => {
    // everything incoming: responses (kind: "response") and events (kind: "event")
    console.log(event.kind, event.name, event.ok);
});
```

Both return an unsubscribe function. For the default instance the same subscriptions are available as module-level `onSend` / `onEvent` exports from the package root.

## Tap events

Each event is a `BridgeTapEvent`:

| Field       | Meaning                                                                 |
| ----------- | ----------------------------------------------------------------------- |
| `id`        | Monotonic counter since page load; pairs a `response` with its `send`   |
| `ts`        | `Date.now()` at emit time                                               |
| `direction` | `"out"` — the app called send; `"in"` — the host sent something         |
| `kind`      | `"send"` (out), `"response"` (in, paired), `"event"` (in, unpaired)     |
| `name`      | Method or event name                                                    |
| `payload`   | The payload; a paired response arrives already stripped of `request_id` |
| `reqId`     | On `response`: the `id` of the originating `send`                       |
| `ok`        | On `response`: whether the promise resolved or rejected                 |

A response carrying `error_type` is a `response` with `ok: false`, not a separate kind.

Payloads are never mutated after emit. A listener always sees a snapshot taken at event time.

## The replay buffer

Until the first subscriber attaches, the tap buffers events (500 by default, dropping the head when full). The first subscriber receives the whole buffer oldest-first, then events stream live. This is what makes a late subscriber harmless: the devtools collector may load after the app has been sending for a while.

```ts
const buffered = bridge.tap.drain(); // what accumulated before any subscription, oldest first
```

The buffer is one-shot: after the first subscribe the tap lives on live delivery only, and `drain()` returns nothing.

## createTap

The tap is a standalone fan-out hub with no dependency on the bridge. Build your own with a different limit and hand it to an instance:

```ts
import { bridgeTap, createTap, createVKBridge } from "@vkma.dev/bridge";

const ownTap = createTap(100);
const bridge = createVKBridge("1.0.0", { tap: ownTap });
// or feed a new instance's traffic into the shared tap:
const visible = createVKBridge("1.0.0", { tap: bridgeTap });
```

## The devtools contract

Importing the package publishes a `{ tap, send }` handle on `globalThis.__vkmaDevtoolsBridge`:

- `tap` — the default instance's shared tap;
- `send(name, params)` — execute a call inside the app: this is what the devtools "execute" runs on.

The first copy of the module on the page creates the handle; every other copy reuses its tap. Duplicate package copies in a bundle do not multiply buffers. Instances from `createVKBridge` publish no global handle.
