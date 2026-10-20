# @vkma.dev/deploy

## 0.1.0

### Minor Changes

- 0745fcf: Initial release: deploy CLI (`vkma-deploy`) and library for VK Mini Apps hosting, drop-in compatible with `@vkontakte/vk-miniapps-deploy`.

    - Config: `vkma-deploy.config.{ts,mts,js,mjs,json}` with `defineDeployConfig`, JSON Schema, legacy `vk-hosting-config.json` fallback, `VKMA_*` env vars with permanent `MINI_APPS_*` aliases
    - Protocol: upload server -> zip upload with byte progress -> hosting task -> queue long-poll with a hard deadline (fixes the upstream infinite hang)
    - Credentials: XDG store (0600) with `login`/`logout`, upstream configstore fallback
    - Logging: pretty TTY output, `--json` events, `--verbose`/`--quiet`, secret redaction in all modes
    - Library API: `deploy()`, `resolveConfig()`, granular steps, typed `DeployError`s, structured event stream
