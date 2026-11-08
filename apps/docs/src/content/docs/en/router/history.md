---
title: "History and the host"
description: "hash and hash-param modes, VKWebAppSetLocation sync, and swipe-back management."
sidebar:
    order: 4
---

A mini app lives in a webview iframe: it has no address bar of its own, and "back" is a system gesture or a host button. The package owns three things: where the URL lives, how the host learns about it, and when the native swipe-back is on.

## History modes

`createVkHistory` from the core layer:

```ts
createVkHistory(); // "hash" (default): #/meeting/7
createVkHistory({ mode: "hash-param" }); // #?path=/meeting/7
// "browser": omit history in createRouter — TanStack takes its default
```

- **`hash`** — the hash IS the location. Relevant when the host does not let you own the path.
- **`hash-param`** — the path rides in the `path` hash param (rename it with `pathParam`). Foreign hash params are preserved, `location.search` is untouched.
- **`browser`** — the plain browser history; just do not pass `history` to `createRouter`.

A deep link written in the other hash mode resolves too (legacy tolerance) — old shared links keep working. The history is built on TanStack's `createBrowserHistory` with swapped `parseLocation`/`createHref`: blockers, popstate and throttling carry over.

## Host sync

`createBridgeSync` wires the history and the host in both directions:

```ts
import { createBridgeSync } from "@vkma.dev/router";

createBridgeSync({ history: router.history, bridge });
```

- Every committed history change goes to the host as `VKWebAppSetLocation` with `replace_state: true` — the share URL and the host's back reflect the app state. The startup location is sent once at creation.
- Incoming `VKWebAppChangeFragment` and `VKWebAppLocationChanged` (host-initiated jumps) become `history.replace(href)`. An echo of your own location is ignored — no loop.
- The host's "back" is `VKWebAppClose` territory: ChangeFragment is not a fragment pop.

The payload codecs depend on the mode: hash sends the hash content, hash-param sends `?path=…` preserving foreign params. Call the sync after the router exists (not in module scope next to its declaration) — otherwise a module cycle dies with a TDZ crash.

## Swipe-back

`createSwipeBackManager` drives the native gesture:

```ts
import { createSwipeBackManager } from "@vkma.dev/router";

createSwipeBackManager({ history: router.history, bridge });
```

The automatic rule: the gesture is enabled while the app can go back in its own history and disabled on the first entry — there the system back must close the app. The implementation sends `VKWebAppSetSwipeSettings { history }` plus `VKWebAppEnableSwipeBack`/`VKWebAppDisableSwipeBack`; web error code 6 is silenced.

The hard opt-out (an app that drives the gesture itself): `createSwipeBackManager({ enabled: false })` — it wins over everything below.

## Per-panel override

```tsx
useEnableSwipeBack(false, panel);
```

Pass `false` on surfaces where the gesture interferes (drawing pads, drag surfaces), and always pass the second argument — the panel handle. Panels are forever-mounted static children: without the binding the override sticks to whichever panel mounted last, while with the ref it applies only while that panel is the deepest matched one and is released on navigation away. `true` forces the gesture even on the first entry — the system back then closes the app.

Overlays on top of the history — in [modals and popouts](/en/router/modals-and-popouts/).
