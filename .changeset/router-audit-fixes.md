---
"@vkma.dev/router": patch
---

Audit fixes: modal surfaces no longer leak the host `stacked` key into the DOM, unmatched URLs and `notFound()` render VKUI NotFound, `showModal` carries the covered panel's search, `VkView` renders the route's `pendingComponent`, and the panel `viewId` getter (always `""` — leading-slash route ids) no longer makes inflate replay foreign views.
