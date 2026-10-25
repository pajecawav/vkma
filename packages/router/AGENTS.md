# AGENTS.md

**Status: pre-implementation.** `@vkma.dev/router` is a VK Mini Apps router
on top of TanStack Router, successor to `@vkontakte/vk-mini-apps-router`
(**feature parity, not API parity**). Right now the package is design +
validated spikes: there is no `package.json` yet — `DESIGN.md` is the
single source of truth, and everything in it under "Decided" and the spike
verdicts is settled. Read it before touching anything here.

## Where things live

- `DESIGN.md` — the decision tree (product frame, URL/history model, VKUI
  layer, overlays, preset, v1 scope), the research digest, spike verdicts
  and implementation notes. Change decisions there first, code second.
- `playground/router-spike` — the throwaway spike playground. All four
  spikes landed in it (`pnpm --filter @vkma.dev/playground-router-spike
  dev`). It is deliberately not production code: new design questions get
  answered by extending it, and every answer lands back in DESIGN.md. Do
  not import it from packages, do not "clean it up" into the real package.

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
- **Modals are routes** (masked child routes; global ones via a pathless
  root route + `?modal=`), never `ModalRoot` (deprecated, gone in VKUI
  v10). Drive controlled `ModalPage open`. The modal host keeps every
  seen modal mounted so closing animations play after the route unmatches;
  `onClose = history.back()`. `ChangeFragment` inbound is a host-initiated
  jump (navigate replace, echo-suppressed) — "host back" is
  `VKWebAppClose` territory, not a fragment pop.
- **Popouts** are transient overlays: `{ popout: id, props }` in
  `history.state`, components from per-panel/global registries (resolution
  local → global, id collision in both is a dev error), `onClose`
  injected. Never store React elements in history state.
- **Search params DX**: prefer Standard Schema validators (zod v4 /
  valibot + TanStack adapters); a function `validateSearch` must return an
  explicitly all-optional shape or `Link`/`navigate` demand `search`.
- **VKUI housekeeping**: no deprecated `Div` (use `Box`); ship a
  VKUI-styled `defaultNotFoundComponent`; `platform="ios"` + `SplitCol
  animate` force transitions on desktop (spike testing setup).

## Definition of done for v1

Feature parity per the DESIGN.md table: restorable deep links (incl.
modals), per-view panel history with swipe-back semantics, inflate
(synthetic parent chain after deep links, auto-derived from the route
tree), blockers, popout back-close, typed preset builders with auto-shell,
parity navigator, migration guide. Full environment matrix (web iframe /
mobile webview / standalone) — fake transports in unit tests + the manual
device checklist gates the release (same ritual as `packages/bridge`).
