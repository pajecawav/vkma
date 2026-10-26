---
"@vkma.dev/router": patch
---

Modal surfaces no longer spread host-only keys (`stacked`) into VKUI
modals — VKUI forwards unknown props to the DOM and React warned
"Received `false` for a non-boolean attribute `stacked`" on every stacked
nested modal. `AppRootShell` renders the VKUI `NotFound` for unmatched
URLs and `notFound()` results instead of silently showing the first
view's never-loading spinner. `showModal` carries the panel's search
params onto the modal entry (`search: true`), so the covered panel keeps
its `?tab=…` state instead of snapping to defaults while the modal is
open. `VkView` now renders the route's `pendingComponent` while its
loader runs — as static children it bypasses TanStack's Outlet, so the
pending swap silently never happened (the feed showed a blank list for
its whole artificial 700 ms loader).
