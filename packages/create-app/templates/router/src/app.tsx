import { createRouter } from "@tanstack/react-router";
import { createApp, createVkHistory, NotFound } from "@vkma.dev/router/preset";
import { logoutPopout, settingsModal } from "./overlays";
import { feedView } from "./panels/feed/feed.panel";
import { moreView } from "./panels/more/more.panel";
import { profileView } from "./panels/profile/profile.panel";
import { AppShell } from "./shell";

/**
 * The app tree, three stories (Профиль / Лента / Ещё) driven entirely by
 * the router. Views are `defineView` hubs in `panels/<view>/`; the hub file
 * is the one place the view key is written, and its `hub.panel(...)` calls
 * double as the typed handles their lazy chunks import. The array order is
 * the story order. Overlay definitions nest under the same key they
 * declared — the id stays written in exactly one place.
 */
export const app = createApp({
	root: props => <AppShell {...props} />,
	views: [profileView, feedView, moreView],
	modals: { settings: settingsModal },
	popouts: { logout: logoutPopout },
});

export const router = createRouter({
	routeTree: app.routeTree,
	// without routeMasks a modal open would put its own path in the URL
	routeMasks: app.routeMasks,
	history: createVkHistory({ mode: "hash" }).history,
	defaultNotFoundComponent: NotFound,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
