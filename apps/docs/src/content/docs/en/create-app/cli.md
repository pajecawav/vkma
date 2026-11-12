---
title: "create-app CLI: flags and CI mode"
description: "create-app flags: preset, package manager, --no-install and --no-git; interactive and CI modes."
sidebar:
    order: 2
    label: "CLI"
---

The invocation shape is `create <path> [flags]`. On a TTY the CLI asks for whatever is missing; without one it runs entirely on flags.

## Running it

The package is `@vkma.dev/create-app`, but every manager runs it its own way:

| Manager | Command                                              |
| ------- | ---------------------------------------------------- |
| npm     | `npm create @vkma.dev/app my-app -- --preset router` |
| pnpm    | `pnpm create @vkma.dev/app my-app --preset router`   |
| yarn    | `yarn create @vkma.dev/app my-app --preset router`   |
| bun     | `bunx @vkma.dev/create-app my-app --preset router`   |

npm needs `--` before flags. Otherwise it swallows them as its own options (npm strips the separator before it reaches the CLI). pnpm, yarn and bunx pass flags through; a bare `--` that still lands in argv is silently dropped together with everything after it, so don't add one to those forms.

`my-app` is the positional argument: the project directory, relative to the current one. Interactively, with no path given the CLI asks for it (defaulting to `.`, the current directory); without a TTY the scaffold goes into the current directory.

## Flags

| Flag            | Meaning                                               |
| --------------- | ----------------------------------------------------- |
| `--preset <id>` | Preset: `base`, `vkui` or `router` (default `router`) |
| `--pm <id>`     | Package manager: `npm` \| `pnpm` \| `yarn` \| `bun`   |
| `--no-install`  | Skip installing dependencies after the scaffold       |
| `--no-git`      | Skip git repository init                              |
| `-h`, `--help`  | Print help                                            |

The `--flag=value` form works too: `--preset=base`, `--pm=pnpm`. An unknown flag, a second positional argument or a valueless `--preset` fails with the usage text.

`--pm` is detected from `npm_config_user_agent` by default: the invoking command reports itself (`pnpm create …` → pnpm). When detection fails, a TTY run asks (pnpm is the recommendation); a non-TTY run exits with a request to pass `--pm` explicitly.

## Interactive mode

On a TTY the CLI asks in order:

1. the project directory (placeholder `.`);
2. the preset — a list with descriptions, cursor on `router`;
3. the package manager, if the environment did not reveal one;
4. whether to install dependencies (runs `<pm> install`);
5. whether to init git (`git init --quiet`).

A non-empty directory triggers a confirmation prompt. An unknown preset or manager is an error listing the valid ones.

## Non-interactive mode (CI)

Without a TTY there are no questions, and some flags become required:

- `--preset` is required;
- `--pm` is required when detection failed;
- a non-empty directory aborts without writing anything (a TTY run would confirm instead).

```sh
npm create @vkma.dev/app my-app -- \
  --preset base --pm npm --no-install --no-git
```

After scaffolding the CLI prints next steps: `cd` into the directory, `<pm> install` too when `--no-install` was passed, then the dev command in your manager's shape (`npm run dev`, `pnpm dev`, `bun run dev`) and the deploy hint: set `appId` in `vkma-deploy.config.ts`, authorize once with `npx vkma-deploy login`, then run `deploy`, see [deploy](/en/deploy/).

What exactly gets generated is covered in the [app structure](/en/create-app/structure/).
