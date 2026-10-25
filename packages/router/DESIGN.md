# Design: @vkma.dev/router

VK Mini Apps router built on top of TanStack Router. Successor to
`@vkontakte/vk-mini-apps-router`: **feature parity, not API parity** — a
migration guide ships instead of drop-in compatibility.

**Status: v0.1 implemented and validated end-to-end in
`playground/router-spike`** (which consumes the package, not copies of it).
See "Spikes" for the validation history and "Implementation notes" for the
hard-won invariants; `AGENTS.md` distills them for agents.

## Product frame

| Decision          | Choice                                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Layers            | Two-layer: a thin additive layer over TanStack Router (public, TanStack stays the single source of truth) + an optional batteries-included preset facade                                    |
| Parity            | Feature parity with the old router; new idiomatic API; migration guide                                                                                                                      |
| VKUI coupling     | Core is VKUI-agnostic; the VKUI integration lives in an isolated layer                                                                                                                      |
| Frameworks        | Agnostic core + React adapter (React 18/19); non-React adapters are a non-goal                                                                                                              |
| Package           | Single package `@vkma.dev/router` in this monorepo, subpath exports: `.` (core), `/react`, `/vkui`, `/preset`                                                                               |
| Bridge            | Structural minimum `{ send, subscribe }` — type-compatible with both `@vkontakte/vk-bridge` and `@vkma.dev/bridge`; no hard dependency on either                                            |
| TanStack          | Peer dependency; primitives (`createRouter`, `createRootRoute`, `createRoute`, `Link`, `useNavigate`, …) are re-exported so users import from one place                                     |
| Deep links        | Mandatory in v1: the URL restores the full navigation state (including modals); shareable links survive reload                                                                              |
| TanStack features | Loaders, `beforeLoad`, pending components, typed search schemas and route-level `lazy` must work through every layer — our API is strictly additive, never wrapping or hiding route options |

## URL & history

- **Custom VK history** built on TanStack's public `createHistory` factory:
  the whole router location (path + search + inner hash) lives in the URL
  hash. Foreign hash params (launch params, UTM) are preserved and never
  leak into the router's search params. (TanStack's stock hash history
  merges the real `location.search` into router search — that is why the
  history is custom.)
- **Host sync**: on every location change send
  `VKWebAppSetLocation { location, replace_state: true }`; incoming
  `VKWebAppChangeFragment` / `VKWebAppLocationChanged` navigate the router
  (with loop protection). A manual hash edit by the user counts as a new
  history entry (fresh key via replace, like the old router's factories).
- **Browser mode** is an escape hatch for standalone (non-VK-hosted) web.
- **Inflate** (synthetic history after a deep link): v1, parent chain
  auto-derived from the route tree (no manual `hierarchy` config like the
  old router), replayed as a navigation transaction.
- **Swipe-back**: managed automatically — the native gesture
  (`VKWebAppEnableSwipeBack` / `VKWebAppSetSwipeSettings { history }`) is
  toggled by the router based on the history position (`isFirstPage` ⇒
  system back closes the app). Opt-out plus an imperative hook remain.
- Bridge facts: `VKWebAppGoBack` does not exist — back is always the local
  iframe/webview history; there is no `flushScopeBack` either.

## VKUI layer (`/vkui`)

- **Route tree convention**: story (Epic tab) and view are pathless layout
  routes; a panel is a path child of its view; a modal is a masked child
  route. The preset generates exactly this shape.
- **Static children rendering**: `<View>` renders its panel routes as
  always-mounted JSX children and feeds VKUI's `activePanel` from the
  matched route — VKUI hides the inactive panels itself and animates
  transitions (it infers direction from children order in JSX, not from an
  external flag). A plain `Outlet` would break VKUI animations.
- **`panelsHistory`** (for VKUI's iOS swipe-back): entries back from the
  current position until the view changes, overlay entries excluded — same
  formula as the old router's `ViewHistory.panelsHistory`.
- **Bare names from the subpath**: `import { App, View, Panel, ModalPage }
  from '@vkma.dev/router/vkui'` — the subpath isolates the namespace; alias
  in files that also import VKUI directly.
- **Own data hooks (spike-1 requirement)**: panels must read route data
  through `/vkui` hooks (`usePanelParams`, `usePanelSearch`, …) built as
  `shouldThrow: false` + retain-last-value — raw TanStack data hooks crash
  in a departing panel during the back animation (see spike 1 verdict).
- VKUI 8 facts that constrain us: `View`/`Root`/`Epic` are not deprecated;
  the `history` prop is only used for iOS swipe-back (`slice(-2)[0]`);
  `onTransition` is the completion signal; `ModalRoot` is deprecated
  (removed in v10) and `useModalManager` is imperative with its own
  internal history — we drive modals through **controlled props**
  (standalone `ModalPage open={bool}`), to be verified in spike 2.

## Overlays

- **Modals are routes** (+ route masking, a documented TanStack pattern):
  back closes for free, deep links work.
    - Local modals: SIBLING child routes of a panel (chain steps are
      siblings — nesting modal routes inside each other keeps the parent
      matched and stacks two open sheets, the user-reported bug).
    - Global modals: rendered by the host from `?modal=<id>` on any panel
      (deep-linkable; masking them is a v0.1 TODO — needs an imperative
      `mask` on the open action).
    - Resolution local → global; the same `id` declared in both places is a
      dev-time error.
    - **Sequential choreography**: when the matched modal changes, the host
      closes the displayed sheet (`open={false}` + keepMounted exit budget)
      and opens the new one only after the exit completes — never two open
      sheets at once. Modal→modal navigation REPLACES the history entry
      (old-router parity: back returns to the panel).
- **Popouts** (Alert/ActionSheet/ScreenSpinner) are transient overlays, not
  routes: `history.state` holds `{ popout: id, props }`; back closes them.
  Components are declared per-panel and/or globally (same resolution and
  collision rules as modals). No React elements in history state.
- **Props channels** for overlays:
    1. URL — path params + search params (typed by builders, resolved by
       loaders); the shareable channel.
    2. `location.state` — transient serializable props; survives back/forward
       within the session, never shared.
    3. Callbacks cannot be serialized: `onClose` is injected by the router
       (→ back / hidePopout); business callbacks become navigation or store
       subscriptions.
- Popout props are typed from the declared component:
  `popouts: { 'delete-confirm': ConfirmDelete }` ⇒
  `showPopout('delete-confirm', { itemId })` type-checks.

## Preset facade (`/preset`)

- **Typed builders** (`createApp`, `createView`, `createPanel`,
  `createModal`, popout declarations) that generate the TanStack route tree.
  Every node accepts raw TanStack options (`loader`, `beforeLoad`,
  `validateSearch`, `lazy`, …) passed through untouched, and exposes the
  underlying route as an escape hatch. Typed Page objects power navigation
  (`push(PanelPage, { params })`).
- **Auto-shell**: `<App>` renders Epic/Root/View/modals/popouts from the
  config with slots for customization; headless `/vkui` components remain
  available for custom shells.
- **Parity navigator**: `useNavigator()` → `{ push, replace, back,
  backToFirst, showModal, hideModal, showPopout, hidePopout }` on top of
  TanStack `navigate`/history; the router instance stays reachable.

## v1 scope

- **Environment matrix**: web (vk.com iframe), mobile webviews (iOS,
  Android), standalone browser (browser-history mode). Mobile transports
  are unit-tested via fakes; a manual device checklist gates each release
  (same ritual as the bridge package).
- **Non-goals**: SSR, non-React adapters, file-based routing.

## Research digest (constraints we design against)

- **Bridge**: `VKWebAppSetLocation { location, replace_state? }`,
  `VKWebAppChangeFragment { location }`, `VKWebAppLocationChanged`,
  `VKWebAppSetSwipeSettings { history }`, `VKWebAppEnable/DisableSwipeBack`.
  Launch params never carry a location/hash.
- **TanStack** (`@tanstack/react-router` 1.170.x): public `createHistory`
  factory (subscriptions, blockers and stack indices handled for us — we
  implement `getLocation/pushState/replaceState/back/forward/go/createHref`
  and `notify` on external events); hash history keeps the whole location
  in `#/path?search#frag` **and merges the real `location.search`**;
  modal routes + `createRouteMask` documented; blockers intercept system
  back with rollback; `createLazyRoute` + `route.lazy()` enables chunk
  splitting without file-based routing; memory history for tests.
- **Old router internals worth reusing**: the parallel
  VKUI-coordinates stack (`ViewHistory`) for `panelsHistory`; overlay
  entries in `history.state` with forward-blocking; inflate via
  navigation transactions (one step per commit tick); the "modal match →
  parent panel path" fallback; typed Page builders with collision-suffixed
  ids; throttled context + previous-value reads during back animations
  (may be unnecessary in the static-children model — spike 1 decides).
- **VKUI 8.4**: navigation primitives above; `useNavId`/NavIdProps;
  popout slots removed (portal components rendered anywhere);
  `transitionMotionEnabled`/`SplitCol.animate` control motion; not-active
  panels are unmounted, their scroll cached by VKUI.

## Spikes (throwaway prototypes, in this order)

1. **Panels + animations** — ✅ done, see `playground/router-spike` (commit
   `feat(router): spike 1`) and "Spike 1 verdict" below.
2. **Modals** — ✅ done (commit `feat(router): spike 2 — modals as routes
   with masking`), see "Spike 2 verdict" below.
3. **VK-history** — ✅ done (commit `feat(router): spike 3 — VK history +
   fake host bridge sync`), see "Spike 3 verdict" below.
4. **TanStack passthrough** — ✅ done (commit `feat(router): spike 4`),
   see "Spike 4 verdict" below.

### Spike 1 verdict (2026-10-25, playground/router-spike)

**The static-children model works.** Questions answered:

- ✅ **Static children + `activePanel` from the match**: VKUI renders both
  panels during a transition (`panelNext`/`panelPrev` → `panelActive`
  after ~640ms on iOS), hides inactive panels itself. No `<Outlet>`.
- ✅ **Lazy panels in the static model**: `route.lazy(() => import())` +
  `createLazyRoute` works code-based; `route.options.component` is merged
  in place when the chunk resolves (the panel renders a Spinner fallback
  until then). File-based routing is not needed for splitting.
- ✅ **panelsHistory mirror** indexed by `location.state.__TSR_index`:
    - writes must be gated on router `status === "idle"` — the location
      commit lands one render **before** match resolution, and a naive
      mirror writes the stale panel at the new index (self-healed by the
      replace-on-same-index rule, but still wrong);
    - init (cold start/reload/deep link) must **anchor at the real
      `__TSR_index`** — it survives reloads in `history.state`; earlier
      slots stay `null` and are skipped.
- ❌→✅ **Departing-panel data (the critical finding)**: raw TanStack data
  hooks (`useParams` etc.) **crash** in a departing panel —
  `Invariant failed: Could not find an active match` — because VKUI keeps
  the panel mounted during the back animation while its route no longer
  matches. The error flies past the router's error boundary ("wasn't
  caught by any route") and remounts the whole tree: animation broken,
  scroll/state lost. Fix validated: the `/vkui` layer ships its own data
  hooks (`usePanelParams`: `shouldThrow: false` + retain-last-value while
  mounted) — the departing panel shows frozen data for the entire
  animation. **This is now a hard requirement for the /vkui layer.**
- ⚠️ **Inherent VKUI limitations to document** (same as the old router):
  direction follows JSX declaration order, not history semantics — a PUSH
  back-skip (item → home) animates BACK; `replace` still animates the
  panel change; a same-panel param change does not transition (the panel
  just stays live — correct for `item/7 → item/8`).
- Not needed: the old router's throttled context — VKUI handles the
  transition itself once data hooks stop throwing. The prevValue idea
  survives, but at the data-hook level, not the context level.

### Spike 2 verdict (2026-10-25, playground/router-spike)

**Modals-as-routes fully validated.** Questions answered:

- ✅ **Standalone controlled `ModalPage`** (no ModalRoot): renders through
  its own `vkuiModalOutlet` + `vkuiModalOverlay`; full open/close
  animations (enter/closing state classes observed mid-transition);
  visually verified on 8 screenshots (bottom sheet, dimmed overlay, no
  artifacts) — including deep link, chains and the global modal.
- ✅ **Local modal = child route + declarative `createRouteMask`**: the
  browser URL stays at the panel path (`/item/7`) while the modal is open;
  the real location (`/item/7/details`) rides in `history.state`; deep
  link to the full path opens the modal; back closes it with animation.
- ✅ **Modal chains are just history**: `details → more → back → details`
  works; two sheets stack without artifacts.
- ✅ **Closing animation after unmatch**: the modal host keeps every seen
  modal mounted (`keepMounted`) and flips `open` to false when its route
  stops matching — `onClose = history.back()` is the natural close.
- ✅ **Global modal via search param** (`?modal=settings`) opens from any
  panel; back closes it. Spike read the param directly; the real
  implementation uses the pathless root route; **masking the global modal
  was not validated** (declarative masks are pairwise; the real impl needs
  an imperative `mask` on the open action — implementation note).
- VKUI housekeeping: `Div` is deprecated (use `Box`) — the spike uses it,
  the real package must not.

### Spike 3 verdict (2026-10-25, playground/router-spike)

**VK history + bridge sync validated.** Questions answered:

- ✅ **`createVkHistory`** = `createBrowserHistory` with swapped
  `parseLocation`/`createHref` (the same trick TanStack's own hash history
  uses) — inherits blockers, popstate classification, throttling, TSR
  index/key stamping. The whole router location rides in one hash query
  param (`#?path=%2Fitem%2F7`), **foreign hash params (UTM) survive every
  navigation**, and the real `location.search` (launch params) is never
  touched.
- ✅ **`VKWebAppSetLocation` sync**: must serialize from the history
  EVENT's location, not `window.location` — history notifies subscribers
  synchronously BEFORE its microtask flush writes the URL, so the hash is
  stale by one entry. The initial location is sent once at init. Host
  semantics: `replace_state: true`.
- ✅ **`VKWebAppChangeFragment` inbound**: navigate `{ href, replace }`;
  an echo of the current location is ignored — loop protection verified
  (re-sending the current fragment twice: suppressed, no navigation).
- ✅ **Manual hash edits**: an entry without TanStack state is stamped
  `lastIndex + 1` inside `parseLocation`, so popstate classifies it as
  FORWARD — it behaves like a push (the old router's trick, now proven
  against `__TSR_index`). Verified: editing the hash navigates, back
  returns.
- ⚠️ The sync layer must be initialized AFTER the router exists (a module
  cycle with routes.ts is a TDZ crash); the fake-host model also showed
  that "host back" is NOT a fragment pop (that's `VKWebAppClose`
  territory) — `ChangeFragment` models host-initiated jumps.
- Not separately validated: the browser-history escape hatch (stock
  TanStack history, trivial swap) — covered by TanStack's own tests.

### Spike 4 verdict (2026-10-25, playground/router-spike)

**TanStack features pass through the VKUI layer untouched.**

- ✅ **`loader` + `pendingComponent`** render inside the static-children
  model: the pending spinner lives inside the panel, the loader data
  arrives on settle. Note: `useLoaderData` has NO `shouldThrow` option —
  read loader data through `useMatch({ shouldThrow: false }).loaderData`;
  the `/vkui` data hooks must wrap exactly that family.
- ✅ **`beforeLoad` guard**: `throw redirect({ to: "/" })` for a forbidden
  param (`/item/666`) redirects home, works through the VK history.
- ✅ **Typed search** (`validateSearch`): typed reads in the panel (with
  the departing-freeze semantics), round-trips through the hash-param
  encoding (`#?path=%2Fitem%2F7%3Ftab%3Dreviews`) and `SetLocation`.
- ⚠️ **Finding**: a function-based `validateSearch` must return an
  explicitly all-optional shape (`{ tab?: string }`), otherwise
  `Link`/`navigate`/masks DEMAND `search` (MakeRequiredSearchParams). The
  real package should recommend Standard Schema validators (zod v4 /
  valibot + the TanStack adapters) for proper input/output inference.
- ⚠️ TanStack warns about a missing `defaultNotFoundComponent` — the real
  package must ship a VKUI-styled 404 default (parity with the old
  router's `notFound` option).

## Open questions

- Global modal masking strategy (imperative `mask` on the open action vs
  per-panel declarative masks) — decide during implementation.
- Peer versions to pin: `@vkontakte/vkui` `^8` (v7 compatibility to be
  fact-checked against the `open` prop history), TanStack `^1.170` (floor
  to be confirmed against the `useMatch({ shouldThrow })` API surface).
- Mobile webviews: unit-tested via fakes here; the manual device checklist
  gates the first release (same ritual as the bridge package).

## Implementation notes carried out of the spikes

- The `usePanelParams`/`usePanelSearch`/loader-data hooks (`shouldThrow:
  false` + retain-last-value) are a hard requirement (spike 1).
- The stack mirror writes on `status === "idle"` only and anchors init at
  the real `__TSR_index` (spike 1); `__TSR_index` survives reloads.
- Serialize `SetLocation` from the history event, not `window.location`
  (spike 3); stamp stateless entries `lastIndex + 1` (spike 3).
- Keep-seen-modals-mounted (`keepMounted`) for closing animations (spike 2).
- Prefer Standard Schema validators over function `validateSearch` (spike 4).
- Ship a VKUI `defaultNotFoundComponent`; avoid deprecated VKUI `Div`
  (use `Box`) and build for a `ModalRoot`-free future (spikes 2).
