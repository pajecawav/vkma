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
- **Side panel** (Chrome only) — opened from the FAB panel's toolbar.
  Firefox has no sidePanel API: the button hides there, the FAB and the
  action-icon tab are the Firefox surfaces.

## Firefox

`manifest.firefox.json` runs the background as an MV3 event page
(`background.scripts`) — werpc detects the event-page context and takes
its server branch, so the routing hub works unchanged. Unlike Chrome,
Firefox does not grant content-script host permissions on install
(127+): after loading, approve the listed hosts once in the extension's
permissions.

Extension-API calls go through `shared/api.ts` (`api`): Firefox's
`chrome` namespace is callback-only, its `browser` namespace is not —
the shim picks the promise-capable one at runtime. Never call
`chrome.*` directly.

## Develop

```sh
pnpm build          # rsbuild + web-ext zip (chrome manifest by default)
pnpm start          # web-ext run (chromium)
pnpm start:firefox  # BROWSER=firefox build + web-ext run (firefox)
BROWSER=firefox pnpm build:rsbuild   # firefox manifest only
```

Architecture invariants live in the root `AGENTS.md` (»Devtools
extension«). History is per page load by design — there is no dev server
to outlive a reload.
