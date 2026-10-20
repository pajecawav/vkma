---
"@vkma.dev/deploy": patch
---

feat(deploy): HTTP(S) proxy support — the CLI routes all VK API, upload, and OAuth traffic through `--proxy <url>`, the standard `HTTP_PROXY`/`HTTPS_PROXY` environment variables, or a new `proxy` config field (first match wins, `NO_PROXY` honored). Uses Node's built-in env-proxy support (`http.setGlobalProxyFromEnv`, Node >= 22.21/24); older runtimes warn and continue directly. Credentials in the proxy URL are masked and redacted; socks and the legacy upstream `proxy_url` field are not supported.
