---
"@vkma.dev/devtools": patch
---

fix(devtools): close the panel RPC client on cleanup (reconnect leaked a WebSocket) and surface connection/rpc errors in the status gate
