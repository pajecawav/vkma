---
"@vkma.dev/create-app": patch
---

Fix: generated apps ship their `.gitignore` again. npm pack omits `gitignore` files from tarballs, so the template stores it dotless and the CLI writes it as `.gitignore` at scaffold time.
