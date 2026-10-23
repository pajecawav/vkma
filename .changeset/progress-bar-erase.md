---
"@vkma.dev/deploy": patch
---

Fix upload progress artifacts: erase each frame and shrink the bar to the terminal width so stale speed text never glues on and narrow terminals no longer show ghost frames.
