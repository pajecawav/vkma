---
"@vkma.dev/deploy": patch
---

fix(deploy): the event-205 confirmation prompt now auto-skips for `--yes` and CI runs (AGENTS.md invariant #5) — a CI job with a pseudo-TTY (`docker run -t`) used to hang on readline forever; it now fails fast with the queue's explanatory user error. Sequential prompts (pre-deploy confirm, then the 205 code) share one readline interface per input stream, which also makes them work on non-TTY streams
