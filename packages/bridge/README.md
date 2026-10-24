# @vkma.dev/bridge

Independent VK Bridge for VK Mini Apps. Drop-in classic API (`send` / `subscribe` / `supportsAsync` / …) plus a built-in observability tap, per-send timeout/abort and a configurable `request_id` policy.

Types come from [`@vkma.dev/bridge-schema`](../bridge-schema) — the catalogue of every platform event as data, with an open interface for your own events.

## Install

```sh
pnpm add @vkma.dev/bridge
```

## Use

```ts
import bridge from "@vkma.dev/bridge";

await bridge.send("VKWebAppInit");
const user = await bridge.send("VKWebAppGetUserInfo");

bridge.subscribe(event => {
    // event.detail.type / event.detail.data — every event from the host
});
```

Or build isolated instances (own tap, own pairing state):

```ts
import { createVKBridge } from "@vkma.dev/bridge";

const bridge = createVKBridge(version, {
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
createVKBridge(version, { requestId: { inject: false } });
```

The page-wide default instance also publishes the devtools handle on `globalThis.__vkmaDevtoolsBridge` (`{ tap, send }`) — that's the contract the [VKMA devtools](../devtools) collector observes. Importing the package is enough; no opt-in.

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

See [`@vkma.dev/bridge-schema`](../bridge-schema) for the rules (augment the schema package root; extend only, no overrides).

## Transports

Web (iframe `postMessage` with the `vk-connect` envelope), Android WebView, iOS WebView and React Native WebView — with receive-side `message` / `VKWebAppEvent` listeners to match. Web hosts are exercised by the unit suite and the playground e2e; the mobile WebView transports follow the platform contracts and deserve a manual pass on a real device before a release (see `AGENTS.md` at the repo root).

## License

MIT.
