---
"@vkma.dev/deploy": patch
---

fix(deploy): enforce the queue and login deadlines per request — `--timeout`/VKMA_TIMEOUT and the OAuth login timeout now cut in-flight polls via a composed abort signal instead of being checked only between polls (a hung server could previously outlive the budget until undici's ~300s default); the queue deadline also pauses while the event-205 confirmation prompt is open, so reading the code from your phone no longer burns the budget
