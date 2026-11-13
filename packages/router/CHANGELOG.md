# @vkma.dev/router

## 0.2.0

### Minor Changes

- 927beae: Typed overlays: modal/popout handles with phantom props, required params on links, and popout props delivery

    - `showModal(handle, { params, props })`, `showGlobalModal(def, { props })`, `showPopout(def|handle, props)` and `useModalProps(handle)` type-check against declaration-carried phantoms; the loose string forms remain fallbacks. Panel definitions expose flattened handle maps (`panel.modals.share`, `panel.modals["owner.invite"]`, `panel.popouts.delete`); global overlays are declared via `defineGlobalModal` / `definePopout` next to their components.
    - `createVkLink` targets with `$param` segments now REQUIRE `params` (a missing-params link compiled and broke at runtime before); param-less targets stay optional.
    - FIX: the Popouts host silently dropped the props stashed by `showPopout(id, props)` — they are now delivered to the component (with `onClose` injected last).
    - Documented decision: the builder-generated route tree is `AnyRoute` by construction, so raw TanStack `to`/`params`/`search` typing is inert in builder apps — the typed surface is the preset's handles (see DESIGN "Type safety"); the package is now part of the root `tsc -b` typecheck (a pre-existing `createElement` overload error in `link.tsx` was fixed with it).

## 0.1.6

### Patch Changes

- 41e682d: Serialize modal transitions and keep the VKUI backdrop visible between sheets.

## 0.1.5

### Patch Changes

- 29ba0b2: `useNavigator()` is render-passive: no `useRouterState` subscriptions (state reads moved to call time), stable returned identity; `useShowPopout`/`useHidePopout` callbacks are stable too

## 0.1.4

### Patch Changes

- 050c0b6: `DefaultPanelPendingComponent` (renamed from the internal `PanelSpinnerFallback`) — a header stub + large spinner, exported from `/vkui` and `/preset`, and the pending grace window paints the header stub instead of an empty panel

## 0.1.3

### Patch Changes

- fee36b1: panel pending fallback: 200ms grace delay, and a loaded component is never replaced by a spinner
- 84490b1: `createVkLink` — typed Page-object router links for arbitrary components, with `preload="intent"` route preloading

## 0.1.2

### Patch Changes

- 951d5f4: lazy-panel fallback renders VKUI `PanelSpinner` instead of a bare floating `Spinner`
- 951d5f4: export `storyKeyOf` from the `/vkui` subpath — Epic/Root shells need it to pass the nav key on the element props

## 0.1.1

### Patch Changes

- d03bb33: `useActiveStory(app)` for Epic/Root shells + `VkView` nav defaults to the story key

## 0.1.0

### Minor Changes

- cac1f08: Initial release: VKUI views/panels with static-children animations, modals as (masked) routes with sequential choreography, panel-local/global popouts in history state, VK history in hash/hash-param modes with bridge sync, auto swipe-back with an opt-out and a per-panel override, deep-link inflate, typed preset builders and a parity navigator (typed page objects, blocker context).

### Patch Changes

- 4dd48bb: Audit fixes: modal surfaces no longer leak the host `stacked` key into the DOM, unmatched URLs and `notFound()` render VKUI NotFound, `showModal` carries the covered panel's search, `VkView` renders the route's `pendingComponent`, and the panel `viewId` getter (always `""` — leading-slash route ids) no longer makes inflate replay foreign views.
