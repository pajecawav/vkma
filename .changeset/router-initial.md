---
"@vkma.dev/router": minor
---

Initial release of the VK Mini Apps router on top of TanStack Router: VKUI
views/panels with static-children animations, modals as routes with
sequential close-then-open choreography and masked global modals, popouts
in history state, VK history in hash (default, `#/path`) or hash-param
(`#?path=…`, foreign hash params preserved) modes with bridge sync
(`VKWebAppSetLocation` / `VKWebAppChangeFragment`), auto swipe-back,
deep-link inflate, typed preset builders with an auto-shell, and a parity
navigator. Panel handles are fully typed: `app.panels` keys, route ids and
the params/search/loaderData types flowing through the data hooks are all
inferred from the declared views. `defineView` hubs make the view key
write-once, `definePanel` definitions double as the panels' typed handles,
and the hubs carry the panels — chunks import hubs instead of the app,
with no eraser casts. Route-modal chunks default-export their component
and load through the exported `lazyModal(() => import(...))`. Modal
entries render
their own surface (`ModalPageSurface`/`ModalCardSurface`) with full runtime
props, and `showModal({ props })` passes serializable data into the modal
through history state (`useModalProps`). The sequential modal choreography
completes on the surface's `onClosed` (host timer is only a watchdog). Pairs with `@vkontakte/vk-bridge` or `@vkma.dev/bridge`
(structural contract).
