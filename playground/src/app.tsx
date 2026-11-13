import { createRouter } from "@tanstack/react-router";
import { createApp, createVkHistory, NotFound } from "@vkma.dev/router/preset";
import { ScreenSpinner } from "@vkontakte/vkui";
import { resetPopout, settingsModal } from "./overlays";
import { invitationsView } from "./panels/invitations/invitations.panel";
import { createMeetingModal } from "./panels/plans/create.ui";
import { plansView } from "./panels/plans/plans.panel";
import { profileView } from "./panels/profile/profile.panel";
import { AppShell } from "./shell";

export const app = createApp({
	root: props => <AppShell {...props} />,
	views: [plansView, invitationsView, profileView],
	// definitions double as the typed handles their call sites import
	modals: { settings: settingsModal, create: createMeetingModal },
	popouts: { reset: resetPopout },
});

export const router = createRouter({
	routeTree: app.routeTree,
	routeMasks: app.routeMasks,
	history: createVkHistory({ mode: "hash" }).history,
	defaultNotFoundComponent: NotFound,
	defaultPendingComponent: ScreenSpinner,
	defaultPendingMs: 0,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

declare global {
	interface Window {
		__vkmaApp: typeof app;
	}
}

window.__vkmaApp = app;
