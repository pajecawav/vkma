import { createRouter } from "@tanstack/react-router";
import { createApp, createVkHistory, NotFound } from "@vkma.dev/router/preset";
import { SettingsGlobalModal, LogoutPopout } from "./overlays";
import { feedView } from "./panels/feed/feed.panel";
import { messagesView } from "./panels/messages/messages.panel";
import { moreView } from "./panels/more/more.panel";
import { profileView } from "./panels/profile/profile.panel";
import { AppShell } from "./shell";

/**
 * The showcase app tree — four stories (Профиль / Лента / Сообщения / Ещё)
 * driven entirely by the router. Every @vkma.dev/router feature stays
 * demonstrated: lazy panels, loaders + pending, beforeLoad redirect, typed
 * search, route modals with a chain, the masked global modal, popouts,
 * inflate and the hash history.
 *
 * Views are `defineView` hubs in `panels/<view>/` — the view key is written
 * exactly once, and the `hub.panel(...)` declarations double as the typed
 * handles their lazy chunks import. Nothing imports `app` back: no casts,
 * no inference cycles. The array order is the story order.
 */
export const app = createApp({
	root: props => <AppShell {...props} />,
	views: [profileView, feedView, messagesView, moreView],
	modals: { settings: SettingsGlobalModal },
	popouts: { logout: LogoutPopout },
});

export const router = createRouter({
	routeTree: app.routeTree,
	history: createVkHistory().history,
	defaultNotFoundComponent: NotFound,
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
