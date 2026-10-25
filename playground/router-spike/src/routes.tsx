import { createRootRoute, createRoute, createRouter } from "@tanstack/react-router";
import { AboutPanel, HomePanel, ListPanel } from "./panels";
import { Shell } from "./Shell";
import { VkuiView } from "./VkuiView";

/**
 * PROTOTYPE (spike 1): does the static-children model work?
 *
 * Tree shape under test (the /vkui layer convention):
 *   root (shell) → view-main (pathless layout) → panels as path children,
 *   declaration order == JSX order == natural navigation flow.
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

rootRoute.addChildren([viewRoute]);

export const routeTree = rootRoute.addChildren([
	viewRoute.addChildren([homeRoute, listRoute, itemRoute, aboutRoute]),
]);
export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
