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

1. **Panels + animations** (`playground/router-spike`): static children
   rendering; animation direction vs real history (children order vs
   panelsHistory); transitions that skip a panel; previous-route data for
   the departing panel; `panelsHistory` wiring; lazy panels
   (`createLazyRoute`) inside the static-children model with pending state.
2. **Modals**: modal-as-route + masking; controlled `open` on
   `ModalPage`; back-close; modal chains; global (`?modal=`) vs local;
   open/close animations.
3. **VK-history**: `createHistory` over the hash; launch-param isolation;
   `VKWebAppSetLocation`/`ChangeFragment` sync (fake bridge) with loop
   protection; manual hash edits; browser mode.
4. **TanStack passthrough**: loaders/pending/`beforeLoad`/typed search
   through preset builders; nothing re-wrapped or broken.

Each spike answers its open questions, then its conclusions land back in
this document before the real implementation of that area.

## Open questions

- Spike 1: does the static-children model need the old router's throttled
  context, or do VKUI's own transition states suffice? How does a lazy
  panel's pending state render inside an animating `<Panel>`?
- Spike 2: does the standalone `ModalPage open` prop give the full
  open/close animation outside `ModalRoot`? How do modal chains (modal on
  modal) map onto stacked history entries?
- Spike 3: exact loop-protection contract between `SetLocation` and
  `ChangeFragment`; behavior when the host rewrites the fragment.
- Spike 4: which TanStack versions does the peer range need (floor);
  interplay of `search.strict` with our isolated hash params.
- Peer versions to pin: `@vkontakte/vkui` `^8` (v7 compatibility to be
  fact-checked against the `open` prop history), TanStack `^1.170`.
