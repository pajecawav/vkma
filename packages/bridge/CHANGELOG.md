# @vkma.dev/bridge

## 0.2.1

### Patch Changes

- d6d6398: Hoist the web transport's `parent.postMessage` behind a `webBridge` handle so Facebook Instant Games static analysis stops rejecting cross-published builds (VKCOM/vk-bridge#290)
- 631947f: Parse OK (Odnoklassniki) launch params: OK-only `vk_ok_*` keys, `*_ok` platforms, `true`/`false` toggle serialization
- Updated dependencies [a7e2cbe]
- Updated dependencies [631947f]
- Updated dependencies [d6d6398]
    - @vkma.dev/bridge-schema@0.2.0

## 0.2.0

### Minor Changes

- 3bddd55: Independent VK Bridge — no `@vkontakte/vk-bridge` dependency. Drop-in classic API (`send`/`subscribe`/`supportsAsync`/`applyMiddleware`/`parseURLSearchParamsForGetLaunchParams`) over all four transports, plus: `onSend`/`onEvent` tap on every instance (devtools work out of the box), per-send `timeout`/`signal`, and a configurable `request_id` policy. Types come from `@vkma.dev/bridge-schema`.

### Patch Changes

- Updated dependencies [3bddd55]
    - @vkma.dev/bridge-schema@0.1.0
