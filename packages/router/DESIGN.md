# Design: @vkma.dev/router

VK Mini Apps router built on top of TanStack Router. Successor to
`@vkontakte/vk-mini-apps-router`: **feature parity, not API parity** — a
migration guide ships instead of drop-in compatibility.

This document is the shared understanding produced by the design sessions
(2026-10). Everything under "Decided" is settled; "Spikes" is the validation
plan that precedes implementation.

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
  back closes for free, deep links work, modal chains are just history.
    - Local modals: child routes of a panel.
    - Global modals: pathless route at the root, opened from anywhere via a
      search param (`?modal=<id>`) and masked to the current path.
    - Resolution local → global; the same `id` declared in both places is a
      dev-time error.
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
3. **VK-history**: `createHistory` over the hash; launch-param isolation;
   `VKWebAppSetLocation`/`ChangeFragment` sync (fake bridge) with loop
   protection; manual hash edits; browser mode.
4. **TanStack passthrough**: loaders/pending/`beforeLoad`/typed search
   through preset builders; nothing re-wrapped or broken.

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

## Open questions

- Spike 3: exact loop-protection contract between `SetLocation` and
  `ChangeFragment`; behavior when the host rewrites the fragment.
- Spike 4: which TanStack versions does the peer range need (floor);
  interplay of `search.strict` with our isolated hash params.
- Global modal masking strategy (imperative `mask` on the open action vs
  per-panel declarative masks) — decide during implementation.
- Peer versions to pin: `@vkontakte/vkui` `^8` (v7 compatibility to be
  fact-checked against the `open` prop history), TanStack `^1.170`.
