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
its whole artificial 700 ms loader). Fixed the panel `viewId` getter:
runtime route ids carry a leading slash (`/view:feed`), so
`split("/")[0]` was always `""` and the inflate view filter matched every
panel of the app — a cold home deep link replayed ANOTHER view's panels
before the target (the profile screen flashed on every open/refresh).
The parent-panel chain step is now only added for modal targets — a
panel target already sits on its own history entry, and replaying it was
a pointless no-op navigation.
