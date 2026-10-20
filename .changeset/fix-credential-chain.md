---
"@vkma.dev/deploy": patch
---

fix(deploy): credential chain trust — an expired vkma token now falls through to the still-readable upstream configstore vault instead of reporting "no token"; `logout` warns when the upstream vault still holds a usable fallback token (the vault itself stays read-only by design); credential writes are atomic (temp file + rename, 0600 — a crash can no longer tear the store); the stripped TS-config temp sibling is written with mode 0600 so an inlined token never gets a world-readable copy
