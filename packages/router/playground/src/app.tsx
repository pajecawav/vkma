import { createRouter } from "@tanstack/react-router";
import { createApp, createVkHistory, NotFound } from "@vkma.dev/router/preset";
import { ScreenSpinner } from "@vkontakte/vkui";
import { SettingsGlobalModal } from "./overlays";
import { feedView } from "./panels/feed/feed.panel";
import { messagesView } from "./panels/messages/messages.panel";
import { moreView } from "./panels/more/more.panel";
import { profileView } from "./panels/profile/profile.panel";
import { AppShell } from "./shell";

/**
 * The demo app tree, four stories (Профиль / Лента / Сообщения / Ещё)
 * driven entirely by the router. Every @vkma.dev/router feature stays
 * demonstrated: lazy panels, loaders + pending, beforeLoad redirect, typed
 * search, route modals with a chain, the masked global modal, popouts,
 * inflate and the hash history.
 *
 * Views are `defineView` hubs in `panels/<view>/`. The view key is written
 * exactly once, and the `hub.panel(...)` declarations double as the typed
 * handles their lazy chunks import. Nothing imports `app` back: no casts,
 * no inference cycles. The array order is the story order.
 */
export const app = createApp({
	root: props => <AppShell {...props} />,
	views: [profileView, feedView, messagesView, moreView],
	modals: { settings: SettingsGlobalModal },
	// `logout` is a PANEL-LOCAL popout of profile/settings (see
	// profile.panel.ts). The global registry holds only app-wide popouts
});

export const router = createRouter({
	routeTree: app.routeTree,
	// local route modals are URL-masked back to their panel. Without this,
	// a modal open would put its own path in the address bar
	routeMasks: app.routeMasks,
	history: createVkHistory().history,
	defaultNotFoundComponent: NotFound,
	// the initial load gates the FIRST render on the root match. Without a
	// pending component the cold start is a blank screen for the whole feed
	// loader (an artificial 2s here). pendingMs: 0 shows the pending state
	// from the very
	// first committed frame. Any positive value opens a blank window
	// between React mounting and the pending UI appearing
	defaultPendingComponent: ScreenSpinner,
	defaultPendingMs: 0,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

/** Runtime handle for the debug overlay and browser e2e probes. */
declare global {
	interface Window {
		__vkmaApp: typeof app;
	}
}
window.__vkmaApp = app;
