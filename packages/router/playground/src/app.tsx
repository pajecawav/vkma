import { createRouter } from "@tanstack/react-router";
import { createApp, createVkHistory, NotFound } from "@vkma.dev/router/preset";
import { SettingsGlobalModal, LogoutPopout } from "./overlays";
import { chatPanel } from "./panels/chat.panel";
import { feedPanel } from "./panels/feed.panel";
import { chatsPanel } from "./panels/messages.panel";
import { aboutPanel, morePanel, notificationsPanel } from "./panels/more.panel";
import { postPanel } from "./panels/post.panel";
import { profilePanel, profileSettingsPanel } from "./panels/profile.panel";
import { AppShell } from "./shell";

/**
 * The showcase app tree — four stories (Профиль / Лента / Сообщения / Ещё)
 * driven entirely by the router. Every @vkma.dev/router feature stays
 * demonstrated: lazy panels, loaders + pending, beforeLoad redirect, typed
 * search, route modals with a chain, the masked global modal, popouts,
 * inflate and the hash history.
 *
 * Panels are `definePanel` definitions: the definition IS the typed handle,
 * lives in a leaf module (`panels/*.panel.ts`) and is imported by the
 * panel's own lazy chunk for its data hooks — nothing imports `app` back,
 * so there are no eraser casts and no inference cycles here. View keys
 * match the definitions' view strings (createApp dev-checks it).
 */
export const app = createApp({
	root: ({ app: appHandle }) => <AppShell app={appHandle} />,
	views: {
		profile: { panels: { index: profilePanel, settings: profileSettingsPanel } },
		feed: { panels: { feed: feedPanel, "post/$id": postPanel } },
		messages: { panels: { messages: chatsPanel, "chat/$id": chatPanel } },
		more: { panels: { more: morePanel, notifications: notificationsPanel, about: aboutPanel } },
	},
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
