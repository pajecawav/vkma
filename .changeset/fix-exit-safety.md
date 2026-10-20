---
"@vkma.dev/deploy": patch
---

fix(deploy): drain-safe binary exit — EPIPE on piped output (`--json | jq | head`) is now swallowed instead of crashing with an unhandled-rejection stack dump, the second Ctrl+C restores the terminal cursor before exiting 130, and an unexpected failure in the entry point surfaces as a one-line error with exit code 1
