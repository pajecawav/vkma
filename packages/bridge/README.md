# @vkma.dev/bridge

Drop-in replacement for `@vkontakte/vk-bridge` with a devtools tap: every
outgoing `send`, its paired response, and every unsolicited VK event becomes
observable, and the devtools collector can execute sends inside the app.

```ts
import bridge, { onSend } from "@vkma.dev/bridge";

// identical to @vkontakte/vk-bridge — same instance, same API
await bridge.send("VKWebAppInit");

// additions:
const off = onSend(event => console.log(event.name, event.payload));
off();
```

## How it works

- Re-exports `@vkontakte/vk-bridge` untouched; the default export is a proxy
  that wraps `send` to inject a `vkma_*` `request_id` (vk-bridge already pairs
  responses by `request_id`), which makes send→response pairing exact.
- Every event flows into a bounded-replay tap published on
  `globalThis.__vkmaDevtoolsBridge` — `{ tap, send }` — where the devtools
  collector (`@vkma.dev/devtools`) finds it without sharing a module graph.
- With no collector attached (production) the tap fills a 500-event buffer
  once and stays effectively free.

See `@vkma.dev/devtools` for the panel this powers.
