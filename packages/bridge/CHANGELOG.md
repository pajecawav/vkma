# @vkma.dev/bridge

## 0.2.0

### Minor Changes

- 3bddd55: Independent VK Bridge — no `@vkontakte/vk-bridge` dependency. Drop-in classic API (`send`/`subscribe`/`supportsAsync`/`applyMiddleware`/`parseURLSearchParamsForGetLaunchParams`) over all four transports, plus: `onSend`/`onEvent` tap on every instance (devtools work out of the box), per-send `timeout`/`signal`, and a configurable `request_id` policy. Types come from `@vkma.dev/bridge-schema`.

### Patch Changes

- Updated dependencies [3bddd55]
    - @vkma.dev/bridge-schema@0.1.0
