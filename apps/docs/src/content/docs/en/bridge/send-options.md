---
title: "VK Bridge send options: timeout and AbortSignal"
description: "The third argument of send: timeout, AbortSignal and what happens to a late response."
sidebar:
    order: 2
    label: "Timeouts and cancellation"
---

The third argument of `send` bounds how long the call waits. Without it, a send the host never answers never settles.

```ts
import bridge from "@vkma.dev/bridge";

await bridge.send("VKWebAppGetUserInfo", undefined, {
    timeout: 5000,
    signal: controller.signal,
});
```

## Options

| Option    | Type          | Effect                                         |
| --------- | ------------- | ---------------------------------------------- |
| `timeout` | `number`      | Reject after N milliseconds without a response |
| `signal`  | `AbortSignal` | Reject the moment `abort()` fires              |

The two are independent. Pass either or both.

## timeout

The rejection is an `Error` named `TimeoutError` with a message like `VK Bridge send "VKWebAppGetUserInfo" timed out after 5000ms`:

```ts
try {
    await bridge.send("VKWebAppGetUserInfo", undefined, { timeout: 5000 });
} catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
        // the host did not answer within 5 seconds
    }
}
```

## signal

Cancellation through `AbortController` covers closing a box, navigating away, or losing the network:

```ts
const controller = new AbortController();
const user = bridge.send("VKWebAppGetUserInfo", undefined, { signal: controller.signal });
controller.abort(); // the promise rejects immediately
```

The rejection is an `Error` named `AbortError`. An already-aborted signal rejects the call before dispatch: no transport write, no [tap](/en/bridge/tap/) entry. It is as if the call never happened.

## The late response

`timeout` and `abort` fire even for unpaired calls (e.g. [`inject: false`](/en/bridge/instances/) without a caller `request_id`). After the rejection the pending slot is free: when the answer does arrive, the promise has already settled, so it is delivered as an ordinary event, to `subscribe` and to the tap with `kind: "event"`. No double rejection.

## Retries

There is no built-in retry. The promise settles on the first outcome. Wrap it yourself:

```ts
import bridge, { type UserInfo } from "@vkma.dev/bridge";

async function getUserInfoWithRetry(attempts = 2): Promise<UserInfo> {
    for (let i = 0; i <= attempts; i++) {
        try {
            return await bridge.send("VKWebAppGetUserInfo", undefined, { timeout: 3000 });
        } catch (error) {
            if (i === attempts || (error instanceof Error && error.name === "AbortError")) {
                throw error;
            }
        }
    }
    throw new Error("unreachable");
}
```

Keep in mind the host may have received and executed the first call. A retry executes the method again. For non-idempotent methods (payments, posts) solve it on the host side, not with retries.
