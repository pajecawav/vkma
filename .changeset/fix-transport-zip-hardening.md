---
"@vkma.dev/deploy": patch
---

fix(deploy): transport and zip hardening — fetch no longer follows redirects (a 3xx from a misconfigured or hostile endpoint must not forward the access token in the query string to another origin); user `onEvent` callback errors propagate as themselves instead of being retried as network failures; a UTF-8 BOM no longer defeats HTML detection and JSON parsing; body previews report real UTF-8 byte counts (Cyrillic error messages were off by 2-3x) and never cut surrogate pairs; zip archives are byte-deterministic (fixed 1980-01-01 UTC mtime — identical trees produce identical archives regardless of timezone); a local zip failure exits 1 (config) instead of 2 (network); the queue timeout message no longer leaks upstream internals; `$schema` no longer appears in `meta.sources`; upload retries no longer render negative speeds
