# @vkma.dev/devtools-extension

## 0.2.4

### Patch Changes

- af9bf43: Clients: copy a client's original page URL, tokens included
- 974241e: Execute: the form's draft survives the page reload, one per tab
- 43af868: FAB: no browser tap highlight on touch
- fae6033: Narrow panels without horizontal overflow; the FAB overlay is a full-bleed sheet on phones
- cf3830f: Spy mode: an app nested one frame down (OK's games sit inside an adapter frame) has its requests captured
- e1135f8: Timeline: lighter response indent, wider payload panel
- 268bd3a: The side panel and the all-tabs tab keep receiving events after the watched page reloads
- Updated dependencies [af9bf43]
- Updated dependencies [974241e]
- Updated dependencies [8c79bd4]
- Updated dependencies [43af868]
- Updated dependencies [fae6033]
- Updated dependencies [e1135f8]
    - @vkma.dev/devtools@0.2.3

## 0.2.3

### Patch Changes

- Updated dependencies [c6174fa]
    - @vkma.dev/devtools@0.2.2

## 0.2.2

### Patch Changes

- Updated dependencies [f23dd6b]
    - @vkma.dev/devtools@0.2.1

## 0.2.1

### Patch Changes

- Updated dependencies [3cb8a59]
    - @vkma.dev/bridge@0.2.2
    - @vkma.dev/devtools@0.2.0

## 0.2.0

### Minor Changes

- 282db15: Firefox support: event-page background via werpc's event-page detection, promise-capable API shim (shared/api.ts), MAIN-world relay on the manifest's world key
- 282db15: Frame ↔ client locate in both directions: crosshair flash over the client's iframe, and a click inside a frame rings its client card

### Patch Changes

- Updated dependencies [d6d6398]
- Updated dependencies [631947f]
- Updated dependencies [a7e2cbe]
- Updated dependencies [631947f]
- Updated dependencies [d6d6398]
- Updated dependencies [e12316e]
- Updated dependencies [a7e2cbe]
- Updated dependencies [da6d594]
- Updated dependencies [ba8667b]
- Updated dependencies [603a33f]
- Updated dependencies [6f3a42d]
- Updated dependencies [686c201]
    - @vkma.dev/bridge@0.2.1
    - @vkma.dev/bridge-schema@0.2.0
    - @vkma.dev/devtools@0.2.0
