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
inferred from the declared views. Modal entries can declare a VKUI
`ModalCard` surface (`kind: "card"` + chrome), and the sequential modal
choreography completes on the surface's `onClosed` (host timer is only a
watchdog). Pairs with `@vkontakte/vk-bridge` or `@vkma.dev/bridge`
(structural contract).
