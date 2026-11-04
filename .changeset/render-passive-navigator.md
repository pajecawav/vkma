---
"@vkma.dev/router": patch
---

`useNavigator()` is render-passive: no `useRouterState` subscriptions (state reads moved to call time), stable returned identity; `useShowPopout`/`useHidePopout` callbacks are stable too
