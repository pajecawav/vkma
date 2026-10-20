---
"@vkma.dev/deploy": patch
---

fix(deploy): pretty-output polish — URL blocks now space-pad platform labels to a common width so all URLs start in one column (tab stops misaligned short labels like `vk.ru:`); the event-203 "Confirm the deploy on your phone" line renders bold with blank lines around it (`action_required` event in `--json`, stderr in `--quiet` — without the confirmation the deploy stalls, so it must not drown); the deploy plan separator between bundle and endpoints is a single-spaced `·`
