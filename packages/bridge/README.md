# @vkma.dev/bridge

[![npm](https://img.shields.io/npm/v/@vkma.dev/bridge.svg)](https://www.npmjs.com/package/@vkma.dev/bridge)
[![minzip](https://img.shields.io/bundlephobia/minzip/@vkma.dev/bridge.svg)](https://bundlephobia.com/package/@vkma.dev/bridge)

Independent VK Bridge for VK Mini Apps. Drop-in classic API (`send` / `subscribe` / `supportsAsync` / …) plus a built-in observability tap, per-send timeout/abort and a configurable `request_id` policy.

Types come from [`@vkma.dev/bridge-schema`](https://github.com/pajecawav/vkma/tree/master/packages/bridge-schema#readme) — the catalogue of every platform event as data, with an open interface for your own events.

## Install

```sh
npm install @vkma.dev/bridge
# or: pnpm add / yarn add / bun add
```

## Use

```ts
import bridge from "@vkma.dev/bridge";

await bridge.send("VKWebAppInit");
const user = await bridge.send("VKWebAppGetUserInfo");

// every classic subscribe returns its own off — no unsubscribe bookkeeping
const off = bridge.subscribe(event => {
    // event.detail.type / event.detail.data — every event from the host
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

Everything lives on the instance — no extra imports:

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

The page-wide default instance also publishes the devtools handle on `globalThis.__vkmaDevtoolsBridge` (`{ tap, send }`) — that's the contract the [VKMA devtools](https://github.com/pajecawav/vkma/tree/master/packages/devtools#readme) collector observes. Importing the package is enough; no opt-in.

## Types & custom events

All payload types and the three catalogue maps are re-exported here. To teach the bridge your own (or your proxy backend's) events, extend the schema package — `send`, `subscribe` and every consumer of the types pick it up:

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

The rules live in [`@vkma.dev/bridge-schema`](https://github.com/pajecawav/vkma/tree/master/packages/bridge-schema#readme) — augment that package's root, extend only.

## Transports

Web (iframe `postMessage` with the `vk-connect` envelope), Android WebView, iOS WebView and React Native WebView — with receive-side `message` / `VKWebAppEvent` listeners to match. The web transport is covered by the automated suite; the mobile WebView transports follow the platform host contracts.

## License

MIT.
