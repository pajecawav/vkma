---
"@vkma.dev/bridge": patch
---

Hoist the web transport's `parent.postMessage` behind a `webBridge` handle so Facebook Instant Games static analysis stops rejecting cross-published builds (VKCOM/vk-bridge#290)
