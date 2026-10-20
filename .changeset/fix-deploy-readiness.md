---
"@vkma.dev/deploy": patch
---

fix(deploy): split deploy readiness from config resolution — `login` and `config` no longer demand `staticPath`/`endpoints` (first-run login on a fresh project used to fail with irrelevant errors); the checks now live in `assertDeployReadiness`, enforced by the deploy flow; missing-config guidance includes a minimal config template
