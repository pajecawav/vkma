import {
	createRootRoute,
	createRoute,
	createRouteMask,
	createRouter,
} from "@tanstack/react-router";
import { AboutPanel, HomePanel, ListPanel } from "./panels";
import { Shell } from "./Shell";
import { VkuiView } from "./VkuiView";

/**
 * PROTOTYPE (spikes 1–2): static-children panels + modals-as-routes.
 *
 * Tree shape under test (the /vkui layer convention):
 *   root (shell) → view-main (pathless layout) → panels as path children,
 *   declaration order == JSX order == natural navigation flow.
 * Spike 2 adds modal routes as children of a panel (local) with declarative
 * route masks, plus a global search-param modal (?modal=).
 */
const rootRoute = createRootRoute({ component: Shell });

const viewRoute = createRoute({
	getParentRoute: () => rootRoute,
	id: "view-main",
});
// assigned after creation so the component can close over the route instance
viewRoute.options.component = function ViewMain() {
	return <VkuiView route={viewRoute} />;
};

const homeRoute = createRoute({
	getParentRoute: () => viewRoute,
	path: "/",
	staticData: { panel: "home" },
	component: HomePanel,
});

const listRoute = createRoute({
	getParentRoute: () => viewRoute,
	path: "list",
	staticData: { panel: "list" },
	component: ListPanel,
});

const itemRoute = createRoute({
	getParentRoute: () => viewRoute,
	path: "item/$id",
	staticData: { panel: "item" },
});
// lazy panel: chunk splits without file-based routing (code-based createLazyRoute)
itemRoute.lazy(() => import("./panels/item.lazy").then(m => m.itemLazy));

const aboutRoute = createRoute({
	getParentRoute: () => viewRoute,
	path: "about",
	staticData: { panel: "about" },
	component: AboutPanel,
});

// --- spike 2: local modal routes (children of a panel, masked) ---
const detailsRoute = createRoute({
	getParentRoute: () => itemRoute,
	path: "details",
	staticData: { modal: "details" },
});

const moreRoute = createRoute({
	getParentRoute: () => detailsRoute,
	path: "more",
	staticData: { modal: "more" },
});

rootRoute.addChildren([viewRoute]);

export const routeTree = rootRoute.addChildren([
	viewRoute.addChildren([
		homeRoute,
		listRoute,
		itemRoute.addChildren([detailsRoute.addChildren([moreRoute])]),
		aboutRoute,
	]),
]);

// Masked URLs: while a modal route is matched, the address bar (and shares)
// show the parent panel path; the real location rides in history.state.
const detailsMask = createRouteMask({
	routeTree,
	from: "/item/$id/details",
	to: "/item/$id",
});

const moreMask = createRouteMask({
	routeTree,
	from: "/item/$id/details/more",
	to: "/item/$id",
});

export const router = createRouter({ routeTree, routeMasks: [detailsMask, moreMask] });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
