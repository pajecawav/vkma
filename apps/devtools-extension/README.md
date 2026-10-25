# @vkma.dev/devtools-extension

The vkma.dev panel as a browser extension — devtools for VK Mini Apps on
pages the dev-server plugin can never touch: production builds, games,
third-party apps. Same UI as the devtools panel (`@vkma.dev/ui`), same
wire model (`@vkma.dev/protocol`), different plumbing.

## How it captures

Two modes, picked per mini app frame:

- **direct** — the app runs `@vkma.dev/bridge`: a MAIN-world relay reads
  its tap (`globalThis.__vkmaDevtoolsBridge`) and executes ride the app's
  own bridge instance. Zero changes to the bridge package.
- **spy** — any other bridge (`@vkontakte/vk-bridge`): a second
  `@vkma.dev/bridge` instance in the frame's isolated world sees
  host→app traffic, the top frame sniffs app→host `vk-connect`
  postMessages, and the halves are joined by wire `request_id`.

The TopBar chip shows which: `vkma bridge` (direct) vs `sniffer` (spy).

## Surfaces

- **FAB** on every VK host page (vk.com/vk.ru and friends) — opens the
  panel inline, yields to the side panel when that is open.
- **Action icon** — the full panel in a tab, bound to the clicked tab.
- **Side panel** (Chrome 116+) — opened from the FAB panel's toolbar.

## Develop

```sh
pnpm build          # rsbuild + web-ext zip
pnpm start          # web-ext run (chromium)
pnpm start:firefox  # web-ext run (firefox)
BROWSER=firefox pnpm build:rsbuild   # firefox manifest
```

Architecture invariants live in the root `AGENTS.md` (»Devtools
extension«). History is per page load by design — there is no dev server
to outlive a reload.
