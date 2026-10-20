---
"@vkma.dev/deploy": patch
---

fix(deploy): strict input parsing — `VKMA_TIMEOUT=1e3`/`--timeout 30s` are rejected instead of silently truncating to 1/30 seconds; `--config=` (empty value) is a parse error instead of silently falling back to discovery; whitespace-only `staticPath`/`bundle` count as unset (an empty staticPath used to resolve to cwd and zip the whole project); empty endpoint paths are rejected by the schema
