---
"@vkma.dev/deploy": patch
---

fix(deploy): split deploy readiness from config resolution — `login` and `config` no longer demand `staticPath`/`endpoints` (first-run login on a fresh project used to fail with irrelevant errors); the checks now live in `assertDeployReadiness`, enforced by the deploy flow; `appId` is operation-level too: deploy demands it via readiness (with a config template hint when no config file was found), while `login` prompts for it under `--interactive` and otherwise fails with login-specific guidance
