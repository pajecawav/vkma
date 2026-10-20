---
"@vkma.dev/deploy": patch
---

fix(deploy): enforce redaction on log messages, not only on data — all messages now pass through the redactor in every output mode; raw OAuth server payloads moved from error messages into `details`; the login confirm URL moved out of the timeout message (surfaced via `onAuthUrl`/`rawOut` instead of being masked); `redact()` no longer flattens `Date` objects to `{}` and survives cyclic structures
