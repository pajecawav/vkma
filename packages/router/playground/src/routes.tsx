import { createRouter, redirect } from "@tanstack/react-router";
import { createApp, createVkHistory, NotFound } from "@vkma.dev/router/preset";
import { posts } from "./data";
import { CommentsModal, LogoutPopout, SettingsGlobalModal, ThreadModal } from "./overlays";
import { FeedPanel, FeedPending, type FeedLoaderData } from "./panels/feed";
import { ChatsPanel } from "./panels/messages";
import { AboutPanel, MorePanel, NotificationsPanel } from "./panels/more";
import type { PostSearch } from "./panels/post.lazy";
import { ProfilePanel, ProfileSettingsPanel } from "./panels/profile";
import { AppShell } from "./shell";

/**
 * The showcase app tree — four stories (Профиль / Лента / Сообщения / Ещё)
 * driven entirely by the router. Every @vkma.dev/router feature stays
 * demonstrated: lazy panels, loaders + pending, beforeLoad redirect, typed
 * search, route modals with a chain, the masked global modal, popouts,
 * inflate and the hash history. All TanStack route options pass through.
 */
export const app = createApp({
	root: ({ app: appHandle }) => <AppShell app={appHandle} />,
	views: {
		profile: {
			panels: {
				index: { component: ProfilePanel },
				settings: {
					component: ProfileSettingsPanel,
					validateSearch: (search: Record<string, unknown>): { section?: "privacy" } => ({
						section: search["section"] === "privacy" ? "privacy" : undefined,
					}),
				},
			},
		},
		feed: {
			panels: {
				feed: {
					component: FeedPanel,
					loader: async (): Promise<FeedLoaderData> => {
						await new Promise(resolve => setTimeout(resolve, 700));
						return { posts };
					},
					pendingComponent: FeedPending,
					staleTime: 30_000,
				},
				"post/$id": {
					lazy: routeId => import("./panels/post.lazy").then(m => m.postLazy(routeId)),
					validateSearch: (search: Record<string, unknown>): PostSearch => ({
						tab:
							search["tab"] === "comments" || search["tab"] === "likes"
								? search["tab"]
								: undefined,
					}),
					modals: { comments: CommentsModal, thread: ThreadModal },
				},
			},
		},
		messages: {
			panels: {
				messages: { component: ChatsPanel },
				"chat/$id": {
					lazy: routeId => import("./panels/chat.lazy").then(m => m.chatLazy(routeId)),
					beforeLoad: ({ params }: { params: { id: string } }) => {
						if (params.id === "bot") {
							throw redirect({ to: "/messages" });
						}
					},
				},
			},
		},
		more: {
			panels: {
				more: { component: MorePanel },
				notifications: { component: NotificationsPanel },
				about: { component: AboutPanel },
			},
		},
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
