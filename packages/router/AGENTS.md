# AGENTS.md

**Status: v0.1 implemented.** `@vkma.dev/router` is a VK Mini Apps router
on top of TanStack Router, successor to `@vkontakte/vk-mini-apps-router`
(**feature parity, not API parity**). The four layers are implemented and
validated end-to-end in `packages/router/playground`; `DESIGN.md` is the
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
- `playground` — the showcase playground (a VKUI navigation-guide style
  app: Epic/Tabbar + desktop sidebar, four stories driven by the router).
  It CONSUMES the package (`pnpm --filter @vkma.dev/router build` before
  its dev server — it resolves `dist`). Manual-e2e observability (bridge
  payloads, host stack, `__TSR_index`) hides behind `?debug=1` in the
  router search (`#/?debug=1`) — the flag LATCHES in localStorage (the
  panel exists to be watched while navigating); disarm via the panel's
  hide button or `?debug=0`. Unknown URLs and `notFound()` throws render
  the VKUI NotFound — never a first-story fallback (an unmatched lazy
  panel would spin forever). The feature index in «О приложении» is the
  manual e2e script: every row is a deep link to one scenario. New design
  questions still get answered by spikes here, and every answer lands
  back in DESIGN.md.

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
  Two modes (default `"hash"`): the hash IS the location (`#/item/7`,
  old `createHashRouter` parity), or `"hash-param"` (`#?path=…`, old
  `createHashParamRouter` parity — foreign hash params preserved,
  `location.search` untouched). Deep links written by the other mode
  resolve too (legacy tolerance). Serialize `VKWebAppSetLocation` from
  the history EVENT's location — subscribers are notified before the
  microtask flush, `window.location.hash` is stale by one entry. Entries
  without TanStack state get stamped `lastIndex + 1` so they behave as
  pushes. The bridge sync is initialized after the router exists (module
  cycle ⇒ TDZ crash). `"browser"` → TanStack's default history (old
  `createBrowserRouter`).
- **Modals are routes** (masked child routes — `createApp` builds
  declarative masks to the owning panel; pass `app.routeMasks` into
  `createRouter({ routeMasks })` or a modal open puts its own path in the
  address bar. Global ones via `?modal=` — deep-linkable, masked by the
  imperative open), never `ModalRoot` (deprecated, gone in
  VKUI v10). The Modals host drives the choreography through CONTEXT and
  the ENTRY COMPONENT renders its own surface — `ModalPageSurface` or
  `ModalCardSurface` (the component owns header/card chrome/size as
  ordinary runtime props; the host owns `nav`/`open`/`keepMounted`/
  `onClose`/`onClosed` — registry-declared chrome was tried and rejected:
  modal content is contextual, not declarative). Modal declarations are
  RECURSIBLE: a `{ component, modals }` entry makes its modals child
  routes of that modal — NESTED modals stack on top of the open parent
  (both sheets visible, the host sets `disableFocusTrap` on the covered
  one), `showModal` PUSHES to a child route (target path starts with the
  open modal's `fullPath`), and back unwinds exactly one level revealing
  the parent. Sibling retargets keep the SEQUENTIAL choreography: the old
  sheet closes first and the new one opens only after the exit completes —
  never two sibling sheets at once (the user-reported bug from the first
  spike implementation). The host state is a stack + one exiting sheet;
  the nested/sibling relation is a route-id prefix check. Deep links into
  (nested) modals inflate the FULL ancestor chain — parent panel + every
  modal level, outer → inner — so back walks the natural stack. Exit
  completion is EVENT-DRIVEN on the surface's
  `onClosed` — VKUI backs it with an internal timer computed from the
  element's real `transitionDuration` (useCSSTransition), so it beats any
  host-side constant; the host `exitDuration` is only a WATCHDOG for the
  one case VKUI cannot report (the modal unmounting mid-exit).
  Re-targeting the displayed modal while it exits CANCELS the exit (VKUI
  reverses the transition mid-flight). `onClose = history.back()`. Runtime
  props ride `showModal({ props })` / `showGlobalModal(id, { props })` →
  `history.state` (`vkma:modal` key, serializable only) → `useModalProps()`
  in the component (panel-hook freeze semantics). Chain steps are SIBLING
  child routes of the panel, and modal→modal navigation REPLACES the entry
  (old-router parity: back returns to the panel). `ChangeFragment` inbound
  is a host-initiated jump (navigate replace, echo-suppressed) — "host
  back" is `VKWebAppClose` territory, not a fragment pop.
- **Popouts** are transient overlays: `{ popout: id, props }` in
  `history.state`, components from per-panel (`PanelOptions.popouts`) /
  global registries — the current panel's own registry resolves first, a
  global id collision is a dev-time console error, `onClose` injected.
  Never store React elements in history state.
- **Search params DX**: prefer Standard Schema validators (zod v4 /
  valibot + TanStack adapters); a function `validateSearch` must return an
  explicitly all-optional shape or `Link`/`navigate` demand `search`.
- **Route ids finalize in `route.init()`** (called by `createRouter`) —
  they are unreadable while `createApp` assembles the tree. The preset's
  `panels`/`modals` handles therefore expose `routeId` as GETTERS, and
  `staticData` panel/modal ids use build-time keys
  (`${viewKey}/${panelKey}`), never `route.id`.
- **Typed panel handles** (preset): two shapes.
  **`defineView` hubs + `definePanel` are the recommended one.** A view hub
  (`export const feedView = defineView("feed")` in
  `panels/feed/feed.panel.tsx`) is the ONE place the view key is written;
  `feedView.panel(path, options, lazy?)` creates the definition
  (view-scoped `definePanel`) and registers it in call order — the order is
  what the VKUI View children get, i.e. the push/pop animation direction.
  `createApp({ views: [profileView, ...] })` takes the hubs as a flat array
  (→ loose `AppHandle`); the raw `views: Record<string, ViewOptions>` form
  (→ `TypedAppHandle`, typed `app.panels` map) stays for small inline apps.
  Directory convention per view: `panels/<view>/<view>.panel.ts(x)` (the
  hub, sorts first) + `<name>.ui.tsx` chunks (annotated `: ReactElement`) +
  private modal chunks (`lazy(() => import("./comments.ui"))` — the
  chunk default-exports the component; the loader is a thunk, a bare
  `import(...)` would fetch at app start). A definition IS the typed handle
  (phantom `types`
  derived from the panel's own options: `$param` path segments → params,
  `validateSearch` return → search, `loader` return → loaderData; `routeId`
  is the literal `/view:${view}/${path}` convention). Chunk modules import
  their HUB — never the app — so `app.tsx` needs no erasers or two-phase
  tricks. Non-negotiable rules that keep the type graph acyclic:
    1. The definition's stored type is CLOSED (`options` are widened; the
       data types travel only in the phantom). The `lazy` loader is a
       SEPARATE factory parameter, not an options member — its arrow
       references the UI chunk, whose member types include the (deferred)
       component signatures; inside the inferred options they would close
       an inference cycle the moment a chunk component resolves hooks
       against its own definition (TS7022).
    2. Annotate UI chunk components (`export default function
       FeedPanel(): ReactElement`) — an unannotated signature is deferred,
       and a deferred signature inside the definition's initializer graph
       re-opens the same cycle (the modal chunks in `panels/feed/` carry the
       annotation for exactly this reason).
    3. The hub file must sort BEFORE its chunks
       (`feed.panel.tsx` < `feed.ui.tsx`/`post.ui.tsx`) — TypeScript enters
       the checking graph from whichever file it reaches first; the
       directory convention (`<view>.panel.ts(x)` prefixes with the view
       name) guarantees it. Duplicate view keys and duplicate panel paths
       within a hub are dev-time console errors.
       The raw inline path stays for small apps: panels declared directly in
       `createApp` keep `app.panels["feed/post/$id"]` (literal-keyed map) and
       MUST wrap `lazy` in the `panel()` eraser for the same cyclic reasons.
       A route-id string is the loose fallback in every hook.
- **`addChildren` REPLACES the children array** — collect children and
  call it once (per-modal calls orphan every child but the last; that bug
  manifested as a modal route missing from `routesById`).
- **Custom roots get the handle**: `createApp({ root })` invokes the
  custom root with `{ app }` PLUS the raw match props (the default
  AppRootShell closes over the handle). Custom Epic/Tabbar shells compose
  `useInflate(app)` + `<VkView view={…}>` per story + `<Modals>` /
  `<Popouts>` from `/preset` — Epic matches stories by
  `getNavId(props.nav)`, so pass `nav={view.id}`. Route ids carry a
  LEADING SLASH at runtime (`/view:feed`), and `AnyRoute["id"]` is `any` —
  annotate select callbacks (`(state): string =>`) or `useRouterState`
  degrades to the full-state result.
- **One view owns `/`**: panel paths are global — two views with an
  `index` ("/") panel conflict and matching picks arbitrarily
  (`createApp` console-errors on duplicates at build time). Every other
  view's home panel needs a distinct path segment (`feed`, `messages`…);
  the panel KEY should be that segment (`app.panels` keys are
  `${viewKey}/${panelKey}`).
- **Playground consumes dist**: `packages/router/playground` resolves
  `@vkma.dev/router` to `packages/router/dist` — after any package change,
  `pnpm --filter @vkma.dev/router build` AND a dev-server restart (a
  running Vite serves stale/missing dist transforms). The playground's
  tsconfig paths point tsc at `src` for typechecking.
- **VKUI housekeeping**: no deprecated `Div` (use `Box`); ship a
  VKUI-styled `defaultNotFoundComponent`; `platform="ios"` + `SplitCol
  animate` force transitions on desktop (spike testing setup).

## Definition of done for v1

Remaining before the first release: navigation blockers parity-check (the
`block()` sugar still hardcodes the PUSH action), typed Page-object sugar
for the navigator (TanStack's registered-tree typing already covers raw
navigate). Full environment matrix (web iframe / mobile webview /
standalone) — fake
transports in unit tests + the manual device checklist gates the release
(same ritual as `packages/bridge`).
