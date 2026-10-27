# Migration from `@vkontakte/vk-mini-apps-router`

Feature parity mapping from the old router. The new API is built on
TanStack Router — code-based routes, typed navigation through the
registered tree, and VKUI rendered by our hosts.

## Setup

```ts
// old
import { createHashRouter, RouterProvider } from "@vkontakte/vk-mini-apps-router";
const router = createHashRouter(routes);

import { RouterProvider, createRouter } from "@tanstack/react-router";
// new
import { createApp, createVkHistory, NotFound } from "@vkma.dev/router/preset";

const app = createApp({
    views: {
        main: {
            panels: {
                index: { path: "/", component: HomePanel },
                list: { path: "/list", component: ListPanel },
            },
        },
    },
});

const router = createRouter({
    routeTree: app.routeTree,
    history: createVkHistory(),
    defaultNotFoundComponent: NotFound,
});
```

`createVkHistory()` replaces all three old factories:

```ts
createVkHistory(); // = old createHashRouter (#/path, default)
createVkHistory({ mode: "hash-param" }); // = old createHashParamRouter (#?path=…)
// old createBrowserRouter = TanStack's default history (omit `history`)
```

Both hash modes resolve deep links written by the other (legacy
tolerance).

## Route config → builders

```ts
// old: flat objects with view/panel metadata
const routes = [{ path: "/", panel: "home", view: "main" }, ...];

// new: the tree IS the config; panel order = navigation flow (and the
// inflate chain + VKUI animation direction)
createApp({
	views: {
		main: {
			panels: {
				index: { component: HomePanel },          // path "/"
				list: { path: "/list", component: ListPanel },
				item: { path: "/item/$id", component: Item, lazy: routeId => import(...) },
			},
		},
	},
});
```

Raw TanStack options (`loader`, `beforeLoad`, `validateSearch`, …) pass
through on every node.

## Navigation

```ts
// old
const routeNavigator = useRouteNavigator();
routeNavigator.push({ panel: "persik", params: { id } });
routeNavigator.back();

// new (TanStack-typed via the registered tree)
const navigator = useNavigator();
navigator.push({ to: "/item/$id", params: { id } });
navigator.back(); // also backToFirst(), replace()
```

## Modals

```ts
// old: modal ids in the config, showModal writes history.state
createModal("persik_modal", "/persik_modal");
routeNavigator.showModal("persik_modal");
routeNavigator.hideModal();

// new: modals are child routes of their panel; chains are sibling routes.
// Navigation to a modal replaces the entry when another modal is open;
// the host closes the old sheet before opening the new one.
createPanel("/item/$id", { component: Item, modals: { details: DetailsModal } });
navigator.showModal({ to: "/item/$id/details", params: { id } });
navigator.hideModal();
```

Deep links into modal paths work; `?modal=<id>` global modals are
available from any panel via `navigator.showGlobalModal(id)` (the URL is
masked back to the panel path).

## Popouts

```ts
// old: React elements through the navigator
routeNavigator.showPopout(<Alert onClose={() => routeNavigator.hidePopout()} />);

// new: id + serializable props in history.state, components in a registry
// (back closes the popout, props are restored on back/forward)
createApp({ popouts: { confirm: ConfirmAlert } });
navigator.showPopout("confirm", { itemId: 42 });
navigator.hidePopout();
```

The popout component receives `onClose` from the host — wire it to your
VKUI component's `onClosed`.

## Hooks

| Old                                            | New                                                                                                                     |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `useParams({ panel: id })`                     | `usePanelParams(panelHandle.routeId)` (freeze-safe during back animations)                                              |
| `useSearchParams`                              | `usePanelSearch` / TanStack `useSearch` + `validateSearch`                                                              |
| `useMetaParams`                                | `location.state` (`useRouterState`)                                                                                     |
| `useActiveVkuiLocation` / `useGetPanelForView` | not needed — `VkView` drives VKUI directly; position via VKUI `useNavId`                                                |
| `useFirstPageCheck`                            | `!router.history.canGoBack()`                                                                                           |
| `useHistoryManager`                            | internal (panels mirror); expose on request                                                                             |
| `useBlocker` / `routeNavigator.block`          | `navigator.block(onLeave)` or TanStack `useBlocker`                                                                     |
| `useEnableSwipeBack`                           | `useEnableSwipeBack(enabled, panelRef)` — per-panel override; hard opt-out `createSwipeBackManager({ enabled: false })` |
| `RouterLink`                                   | TanStack `Link` (import from `@tanstack/react-router`)                                                                  |

## Deep links & inflate

Deep links restore the exact screen (including modals). On a cold start
onto a non-first panel, the panel flow before it is replayed
automatically (the old `hierarchy` + `inflate` search param) — disable
with `createApp({ inflate: false })`.

## Not carried over

- `Root`/`Epic` multi-story routing: render `VkView` per story inside your
  own `Epic` (the builders are per-view already).
- `interval`/`throttled` RouterProvider props: unnecessary — panels stay
  mounted during transitions in the static-children model.
