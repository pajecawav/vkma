---
"@vkma.dev/router": patch
---

Modal surfaces no longer spread host-only keys (`stacked`) into VKUI
modals — VKUI forwards unknown props to the DOM and React warned
"Received `false` for a non-boolean attribute `stacked`" on every stacked
nested modal. `AppRootShell` renders the VKUI `NotFound` for unmatched
URLs and `notFound()` results instead of silently showing the first
view's never-loading spinner.
