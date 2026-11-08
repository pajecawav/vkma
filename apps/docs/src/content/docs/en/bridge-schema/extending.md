---
title: "Extending the catalogue"
description: "Augmenting the three maps via declare module: your own methods, push events and the merging rules."
sidebar:
    order: 1
---

The event catalogue is a set of interfaces in the root of `@vkma.dev/bridge-schema`; extend them with `declare module`, no forks needed.

## Where the declaration lives

Create an ambient `.d.ts` inside your `tsconfig` include — say `src/bridge-catalogue.d.ts`:

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

## What each map does

| Map               | Key                       | What it gives you                                           |
| ----------------- | ------------------------- | ----------------------------------------------------------- |
| `RequestPropsMap` | Method name               | Types the props and makes the name sendable via `send`      |
| `ReceiveDataMap`  | Method name or event name | Types the `send` response and the event data in `subscribe` |
| `ReceiveEventMap` | Method name               | Wiring: the method's `Result` and `Failed` event names      |

The `ReceiveDataMap` key depends on the event's nature. For a method with a response it is the method name, like the built-in `VKWebAppGetUserInfo: UserInfo` — that is the key `send` resolves the response type by. For an event with no request side it is the event name itself.

The example above is a method with a response: the mini app lives in a non-standard host (your own wrapper, a dev stub) and calls its own `MyAppBackendCall`; the host answers with `MyAppBackendCallResult` / `MyAppBackendCallFailed`.

## A push event with no request

The host reports on its own, no `send` involved — add a single `ReceiveDataMap` entry:

```ts
declare module "@vkma.dev/bridge-schema" {
    interface ReceiveDataMap {
        MyAppSyncUpdate: { revision: number };
    }
}
```

Now it narrows in `subscribe`:

```ts
bridge.subscribe(event => {
    if (event.detail.type === "MyAppSyncUpdate") {
        // event.detail.data.revision: number
    }
});
```

## What send gets

With the first example's augmentation the call is fully typed through [`@vkma.dev/bridge`](/en/bridge/):

```ts
const response = await bridge.send("MyAppBackendCall", {
    path: "/counter",
    body: { id: 1 },
});
// response: { status: number; payload: unknown }

try {
    await bridge.send("MyAppBackendCall", { path: "/boom" });
} catch (failed) {
    // the MyAppBackendCallFailed body — a rejection like any Failed event
}
```

The names are plain string literals; the catalogue enforces no naming scheme. Keep the `…Result` / `…Failed` convention for paired events: the `ReceiveEventMap` wiring relies on it.

## Rules

- The augmentation target is the root of `@vkma.dev/bridge-schema`. Declaration merging only applies to the module declaring the interfaces; `@vkma.dev/bridge` merely re-exports the maps — `declare module "@vkma.dev/bridge"` merges nothing.
- Extend only. TS interface merging cannot alter or remove existing members. A fix to the built-in catalogue (VK changed a payload) ships as a new schema release, not as an augmentation.

The catalogue's raw JSON document, when you need it at runtime, is covered in [the catalogue as data](/en/bridge-schema/data/).
