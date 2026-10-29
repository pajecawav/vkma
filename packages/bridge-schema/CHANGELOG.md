# @vkma.dev/bridge-schema

## 0.2.0

### Minor Changes

- a7e2cbe: New `./catalogue` entrypoint: wiring tables plus generation-time payload stubs, without the `$defs` document

### Patch Changes

- 631947f: Catalogue: `*_ok` platform values and optional OK-only launch-param keys; toggle serialization widened to `0 | 1 | boolean`
- d6d6398: `VKWebAppShare` response is `{ result: LinkShareResult[] }`, not the bare array upstream types (VKCOM/vk-bridge#554, confirmed by VK)

## 0.1.0

### Minor Changes

- 3bddd55: JSON Schema catalogue of VK Bridge events: 96 methods, 115 receive events, the Result/Failed wiring, generated TypeScript types, the raw catalogue as data behind `./schema`, and open catalogue interfaces — extend your own events via `declare module "@vkma.dev/bridge-schema"`.
