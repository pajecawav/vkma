---
title: "CLI"
description: "vkma-deploy commands: init, login, deploy, flags, prompts and exit codes."
sidebar:
    order: 1
---

The binary is `vkma-deploy`; without installing run `npx @vkma.dev/deploy` (or `pnpm dlx` / `yarn dlx` / `bunx`).

## Commands

| Command                           | What it does                                                                         |
| --------------------------------- | ------------------------------------------------------------------------------------ |
| `vkma-deploy [deploy] [flags]`    | Deploy (the default command): config → archive → upload → queue                      |
| `vkma-deploy init`                | Create `vkma-deploy.config.ts`; a wizard on a TTY, flags otherwise                   |
| `vkma-deploy login`               | Authorize via the browser, store the token locally                                   |
| `vkma-deploy logout`              | Remove stored credentials                                                            |
| `vkma-deploy config`              | Print the resolved config: each value's source plus warnings; the token stays hidden |
| `vkma-deploy completions <shell>` | Shell completion script: `bash`, `zsh`, `fish`                                       |

`init` refuses to touch an existing config and points you at the file to edit. Values are imported from a legacy `vk-hosting-config.json` in the current directory (the token is never copied into the new file); only what is still missing gets prompted for. `init` flags: `--app-id <id>` (required without a TTY), `--static-path <dir>` (default `./dist`), `--endpoints <mobile,mvk,web>` (default: all three, each pointing at `index.html`).

## Deploy flags

| Flag                                 | What it does                                                       |
| ------------------------------------ | ------------------------------------------------------------------ |
| `--env <dev\|production\|both>`      | Target environment (default `both`)                                |
| `--config <path>`                    | Explicit config file, skipping discovery (not supported by `init`) |
| `--timeout <sec>`                    | Hosting queue deadline (default 600)                               |
| `--test-group <name>`                | Deploy into a named test group (dev only)                          |
| `--proxy <url>`                      | Route all traffic through an HTTP(S) proxy                         |
| `--update-prod` / `--no-update-prod` | Whether to switch production URLs; see [URL policy](#url-policy)   |
| `--update-dev` / `--no-update-dev`   | Whether to switch dev URLs; same rules                             |
| `--dry-run`                          | Validate the config and build the archive without uploading        |
| `--interactive`                      | Prompt for missing values (TTY only)                               |
| `--yes`, `-y`                        | Skip the pre-deploy confirmation                                   |
| `--json`                             | Machine-readable NDJSON events on stdout                           |
| `--verbose`, `-v`                    | Debug output including HTTP requests (secrets masked)              |
| `--quiet`, `-q`                      | Errors only                                                        |
| `--no-color`                         | Disable colors (`NO_COLOR` is honored too)                         |
| `--status`                           | Enable OSC 7501 terminal status reports (off by default)           |
| `--help`, `-h` / `--version`, `-V`   | Help / version                                                     |

## Interactivity

By default the CLI never prompts. That default is CI-safe. `--interactive` (TTY only) asks only for values nothing else provides; precedence is flag > env > config > prompt, and prompted values are never written back into your config. `--interactive` cannot rescue a config missing `appId`/`staticPath`. Resolution fails before any prompt.

Prompted unconditionally, TTY only (skipped with the `CI` env var, non-TTY stdin, and `--json`/`--quiet`):

- **The VK confirmation code** (queue event 205): VK sends a code for some deploys. An empty answer or Ctrl+C aborts with exit `130`, never a fake success. In CI the run fails fast. Supply the code programmatically via the library API (`confirmCode`).
- **The deploy plan + `Deploy? (Y/n)`**: environments, URL switching, test group, bundle, endpoints. Enter proceeds; `n` cancels with exit `130` before anything leaves the machine.

## URL policy

Switching production/dev URLs to the new version is always explicit, and VK's server default never decides silently:

- **Set** via a flag or a config field — used as given, no questions asked.
- **Unset on a TTY** — the CLI asks right before the plan: `Enter` accepts the shown default (yes), `n` pins "do not switch". Declining an update prompt does not cancel the deploy; only `n` on `Deploy?` does.
- **Unset in a non-interactive run** (non-TTY, `CI`, `--json`/`--quiet`) — fails with `E_UPDATE_FLAG_REQUIRED` (exit `1`) naming the flag to pass. This includes `--yes`: automation must pin its URL policy.
- **Unset with `--yes` or `--dry-run` on a TTY** — the flags stay unset and VK's server default applies (the plan says `server default`).

Prompted answers never overwrite values that a flag, env var, or config file already provided.

## Terminal status

`--status` enables OSC 7501 reports (the Program Status Protocol): a compatible terminal (Rex, Ghostty) shows what the CLI is doing outside the log. `working` while zipping and uploading (with percentages), `blocked` on prompts and the phone confirmation (queue event 203), `done` with the deployed version, `error` with the failure message, `idle` after Ctrl+C. Reports are written to a TTY only, `--json` output stays escape-free, and the text passes the same secret masking as every printed line.

## login and logout

`login` runs the OAuth device flow: it opens the browser (TTY only), waits for approval and stores the token at `$XDG_CONFIG_HOME/vkma/deploy/credentials.json` with mode `0600`. The token is never printed. `appId` comes from the config, `VKMA_APP_ID`, or a prompt via `--interactive`. The first run also reads the token saved by the official `@vkontakte/vk-miniapps-deploy`, so migrating needs no re-login.

`logout` removes the stored token; if the official tool's token is still installed, the CLI warns that the fallback remains usable.

## Exit codes

| Code  | Meaning                                 |
| ----- | --------------------------------------- |
| `0`   | success                                 |
| `1`   | config or user error                    |
| `2`   | network, timeout                        |
| `3`   | VK API error                            |
| `130` | aborted: Ctrl+C or a declined `Deploy?` |

## Next

- [Configuration](/en/deploy/config/) — every field and the legacy format.
- [Env and CI](/en/deploy/env-and-ci/) — env vars, non-interactive deploys, proxies.
