import { createRouter } from "@tanstack/react-router";
import { createApp, createVkHistory, NotFound } from "@vkma.dev/router/preset";
import { LogoutPopout, SettingsModal } from "./overlays";
import { feedView } from "./panels/feed/feed.panel";
import { moreView } from "./panels/more/more.panel";
import { profileView } from "./panels/profile/profile.panel";
import { AppShell } from "./shell";

/**
 * The app tree, three stories (Профиль / Лента / Ещё) driven entirely by
 * the router. Views are `defineView` hubs in `panels/<view>/`; the hub file
 * is the one place the view key is written, and its `hub.panel(...)` calls
 * double as the typed handles their lazy chunks import. The array order is
 * the story order.
 */
export const app = createApp({
	root: props => <AppShell {...props} />,
	views: [profileView, feedView, moreView],
	modals: { settings: SettingsModal },
	popouts: { logout: LogoutPopout },
});

export const router = createRouter({
	routeTree: app.routeTree,
	// without routeMasks a modal open would put its own path in the URL
	routeMasks: app.routeMasks,
	// hash mode (old createHashRouter parity): the hash IS the location,
	// #/item/7; the host preloader and native back keep native semantics.
	// Legacy `#?path=` deep links resolve too. Caveats vs hash-param mode:
	// foreign hash params can't ride the location. The devtools OTP link
	// `#devframe_otp=…` boots the router on an unmatched path (NotFound
	// screen) and only a reload clears it after devframe strips itself;
	// if that dev flow matters more than plain `#/path` URLs, use the
	// "hash-param" mode instead.
	history: createVkHistory({ mode: "hash" }).history,
	defaultNotFoundComponent: NotFound,
	// VkView owns pending rendering. After the 200ms grace it shows its
	// own canonical fallback (header stub + large PanelSpinner), so the
	// router-level pending options would never render.
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
