---
"@vkma.dev/deploy": patch
---

Keep the upload speed visible between recomputations: it is now sticky (~every 300 ms window) instead of blinking away on frequent per-chunk frames, which the erase-line fix exposed.
