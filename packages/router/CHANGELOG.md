# @vkma.dev/router

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
