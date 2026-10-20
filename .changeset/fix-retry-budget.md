---
"@vkma.dev/deploy": patch
---

fix(deploy): one retry budget per operation — `runWithRetry` now owns the loop, the exponential backoff with jitter, and abort checks for `callApi`, `httpGet`, and `uploadBundle`; previously the API call composed over the transport's own retry loop (up to maxAttempts² requests per call) and the backoff formulas had drifted (missing jitter on uploads, a magic +350ms on rate-limit retries)
