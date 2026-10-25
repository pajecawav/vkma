# AGENTS.md

**Status: v0.1 implemented.** `@vkma.dev/router` is a VK Mini Apps router
on top of TanStack Router, successor to `@vkontakte/vk-mini-apps-router`
(**feature parity, not API parity**). The four layers are implemented and
validated end-to-end in `playground/router-spike`; `DESIGN.md` is the
source of truth for decisions, spike verdicts and implementation notes —
read it before touching anything here.

## Where things live

- `DESIGN.md` — the decision tree (product frame, URL/history model, VKUI
  layer, overlays, preset, v1 scope), the research digest, spike verdicts
  and implementation notes. Change decisions there first, code second.
- `src/core` — React-free: `createVkHistory` (hash-param history on
  `createBrowserHistory`), panels-stack mirror, bridge sync, swipe-back
  manager, structural bridge contract.
- `src/react` — data hooks with departing-panel freeze semantics
  (`usePanelParams` & co.), `usePanelsHistory`.
- `src/vkui` — `VkView` (static children), `Modals` (sequential
  choreography host), `Popouts` (history-state registry), `NotFound`.
- `src/preset` — `createApp` typed builders (views/panels/modals/popouts →
  TanStack tree + registries), `AppRootShell` auto-shell, `useNavigator`.
- `playground/router-spike` — the integration playground; it CONSUMES the
  package (`pnpm --filter @vkma.dev/router build` before its dev server —
  it resolves `dist`). New design questions still get answered by spikes
  there, and every answer lands back in DESIGN.md.

## Non-obvious invariants (from the spikes — do not rediscover them)

- **Layers**: core (VKUI-agnostic, no React) → `/react` → `/vkui` →
  `/preset`, one package with subpath exports. VKUI never leaks below
  `/vkui`. The bridge is a structural `{ send, subscribe }` — compatible
  with both `@vkontakte/vk-bridge` and `@vkma.dev/bridge`, hard dep on
  neither. TanStack is a peer and its primitives are re-exported.
- **Strictly additive over TanStack**: route options (`loader`,
  `beforeLoad`, `validateSearch`, `lazy`, …) pass through untouched
  (spike 4). Never wrap or re-invent them.
- **Static children, no Outlet**: `/vkui` renders all panel routes as
  always-mounted VKUI View children; the router only feeds `activePanel`.
  VKUI infers direction from JSX declaration order — a push back-skip
  animates BACK and `replace` still animates; these are inherent VKUI
  behaviors, documented, not bugs to fix.
- **Own data hooks are mandatory**: raw TanStack data hooks crash in a
  departing panel during the back animation (`Invariant failed: Could not
  find an active match`) and nuke the tree past the router's error
  boundary. `/vkui` ships `usePanelParams` & co. built as
  `shouldThrow: false` + retain-last-value-while-mounted. Loader data goes
  through `useMatch({ shouldThrow: false })` (`useLoaderData` has no such
  option).
- **Stack mirror** (panelsHistory source): index it by
  `location.state.__TSR_index`, write only when the router
  `status === "idle"` (the location commit lands a render before match
  resolution), and anchor init at the real index — it survives reloads.
- **VK history**: built on `createBrowserHistory` with swapped
  `parseLocation`/`createHref` (inherit blockers/popstate/throttling).
  The location rides in ONE hash query param (`#?path=…`); foreign hash
  params are preserved and never leak into router search;
  `location.search` (launch params) is untouched. Serialize
  `VKWebAppSetLocation` from the history EVENT's location — subscribers
  are notified before the microtask flush, `window.location.hash` is stale
  by one entry. Entries without TanStack state (manual hash edits) get
  stamped `lastIndex + 1` so they behave as pushes. The bridge sync is
  initialized after the router exists (module cycle ⇒ TDZ crash).
- **Modals are routes** (masked child routes; global ones via `?modal=` —
  deep-linkable, unmasked in v0.1), never `ModalRoot` (deprecated, gone in
  VKUI v10). Drive controlled `ModalPage open`. The modal host keeps the
  exiting modal mounted (`keepMounted`) so closing animations play, and
  choreographs chains SEQUENTIALLY: when the matched modal changes, the
  old sheet closes first and the new one opens only after the exit
  completes — never two open sheets at once (the user-reported bug from
  the first spike implementation). Chain steps are SIBLING child routes of
  the panel, and modal→modal navigation REPLACES the entry (old-router
  parity: back returns to the panel; the choreography would handle a push
  the same way if an app wants back-through-chains). `onClose =
  history.back()`. `ChangeFragment` inbound is a host-initiated jump
  (navigate replace, echo-suppressed) — "host back" is `VKWebAppClose`
  territory, not a fragment pop.
- **Popouts** are transient overlays: `{ popout: id, props }` in
  `history.state`, components from per-panel/global registries (resolution
  local → global, id collision in both is a dev error), `onClose`
  injected. Never store React elements in history state.
- **Search params DX**: prefer Standard Schema validators (zod v4 /
  valibot + TanStack adapters); a function `validateSearch` must return an
  explicitly all-optional shape or `Link`/`navigate` demand `search`.
- **Route ids finalize in `route.init()`** (called by `createRouter`) —
  they are unreadable while `createApp` assembles the tree. The preset's
  `panels`/`modals` handles therefore expose `routeId` as GETTERS, and
  `staticData` panel/modal ids use build-time keys
  (`${viewKey}/${panelKey}`), never `route.id`.
- **`addChildren` REPLACES the children array** — collect children and
  call it once (per-modal calls orphan every child but the last; that bug
  manifested as a modal route missing from `routesById`).
- **Playground consumes dist**: `playground/router-spike` resolves
  `@vkma.dev/router` to `packages/router/dist` — after any package change,
  `pnpm --filter @vkma.dev/router build` AND a dev-server restart (a
  running Vite serves stale/missing dist transforms). The playground's
  tsconfig paths point tsc at `src` for typechecking.
- **VKUI housekeeping**: no deprecated `Div` (use `Box`); ship a
  VKUI-styled `defaultNotFoundComponent`; `platform="ios"` + `SplitCol
  animate` force transitions on desktop (spike testing setup).

## Definition of done for v1

Remaining before the first release: inflate (synthetic parent chain after
deep links, auto-derived from the route tree), navigation blockers
parity-check, masked global modals (imperative `mask` on the open action),
typed Page-object sugar for the navigator (TanStack's registered-tree
typing already covers raw navigate), migration guide, changesets version.
Full environment matrix (web iframe / mobile webview / standalone) — fake
transports in unit tests + the manual device checklist gates the release
(same ritual as `packages/bridge`).
