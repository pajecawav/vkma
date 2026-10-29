---
"@vkma.dev/bridge-schema": patch
---

`VKWebAppShare` response is `{ result: LinkShareResult[] }`, not the bare array upstream types (VKCOM/vk-bridge#554, confirmed by VK)
