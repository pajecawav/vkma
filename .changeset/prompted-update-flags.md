---
"@vkma.dev/deploy": minor
---

Require an explicit URL-switch policy: unset `--update-prod`/`--update-dev` are confirmed on a TTY and fail with `E_UPDATE_FLAG_REQUIRED` in non-interactive runs.
