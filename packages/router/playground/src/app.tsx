import { createRouter, redirect } from "@tanstack/react-router";
import { createApp, createVkHistory, NotFound, panel } from "@vkma.dev/router/preset";
import { ScreenSpinner } from "@vkontakte/vkui";
import { lazy, type ComponentType } from "react";
import { posts } from "./data";
import { LogoutPopout, SettingsGlobalModal } from "./overlays";
import { AppShell } from "./shell";

/**
 * The showcase app tree — four stories (Профиль / Лента / Сообщения / Ещё)
 * driven entirely by the router. Every @vkma.dev/router feature stays
 * demonstrated: lazy panels, loaders + pending, beforeLoad redirect, typed
 * search, route modals with a chain, the masked global modal, popouts,
 * inflate and the hash history. All TanStack route options pass through.
 *
 * The options object is created SEPARATELY from `app` on purpose: the chunk
 * modules import `app` back for their typed panel handles, and inlining
 * `createApp({...})` into `app`'s own initializer makes that initializer
 * self-referential (TS7022, inference degrades to the constraint). With the
 * two-phase form the literal is checked once, standalone, and `createApp`
 * infers from a finished type. `panel()` erases the chunk's component types
 * at the boundary for the same reason.
 */

/**
 * Type-blind chunk imports. The chunk modules import `app` back for their
 * typed panel handles — naming their members directly would make `app`'s
 * own type circular (TS7022). Casting the module promise to the exact
 * shape `panel()`/`lazyModal()` need keeps the edge one-way.
 */
const feedChunk = () => import("./panels/feed") as Promise<{ FeedPanel: ComponentType }>;
const profileChunk = () =>
	import("./panels/profile") as Promise<{
		ProfilePanel: ComponentType;
		ProfileSettingsPanel: ComponentType;
	}>;
const messagesChunk = () => import("./panels/messages") as Promise<{ ChatsPanel: ComponentType }>;
const moreChunk = () =>
	import("./panels/more") as Promise<{
		MorePanel: ComponentType;
		NotificationsPanel: ComponentType;
		AboutPanel: ComponentType;
	}>;
const postLazyChunk = (routeId: string) =>
	import("./panels/post.lazy").then(m => m.postLazy(routeId)) as Promise<{
		component: ComponentType;
	}>;
const chatLazyChunk = (routeId: string) =>
	import("./panels/chat.lazy").then(m => m.chatLazy(routeId)) as Promise<{
		component: ComponentType;
	}>;
const postModalsChunk = () =>
	import("./panels/post-modals") as Promise<{
		CommentsModal: ComponentType;
		ThreadModal: ComponentType;
		ShareCard: ComponentType;
	}>;

/** React.lazy bridge for route-modal components in panel chunks. */
const lazyModal = <T extends ComponentType>(load: () => Promise<{ default: T }>): ComponentType =>
	lazy(load) as unknown as ComponentType;

export const app = createApp({
	root: ({ app: appHandle }) => <AppShell app={appHandle} />,
	views: {
		profile: {
			panels: {
				index: {
					lazy: panel(() => profileChunk().then(m => ({ component: m.ProfilePanel }))),
				},
				settings: {
					lazy: panel(() =>
						profileChunk().then(m => ({ component: m.ProfileSettingsPanel })),
					),
					validateSearch: (search: Record<string, unknown>): { section?: "privacy" } => ({
						section: search["section"] === "privacy" ? "privacy" : undefined,
					}),
				},
			},
		},
		feed: {
			panels: {
				feed: {
					lazy: panel(() => feedChunk().then(m => ({ component: m.FeedPanel }))),
					loader: async () => {
						await new Promise(resolve => setTimeout(resolve, 700));
						return { posts };
					},
					pendingComponent: () => <ScreenSpinner style={{ height: "100vh" }} />,
					staleTime: 30_000,
				},
				"post/$id": {
					lazy: panel(routeId => postLazyChunk(routeId)),
					validateSearch: (
						search: Record<string, unknown>,
					): {
						tab?: "comments" | "likes";
					} => ({
						tab:
							search["tab"] === "comments" || search["tab"] === "likes"
								? search["tab"]
								: undefined,
					}),
					modals: {
						comments: lazyModal(() =>
							postModalsChunk().then(m => ({ default: m.CommentsModal })),
						),
						thread: lazyModal(() =>
							postModalsChunk().then(m => ({ default: m.ThreadModal })),
						),
						share: lazyModal(() =>
							postModalsChunk().then(m => ({ default: m.ShareCard })),
						),
					},
				},
			},
		},
		messages: {
			panels: {
				messages: {
					lazy: panel(() => messagesChunk().then(m => ({ component: m.ChatsPanel }))),
				},
				"chat/$id": {
					lazy: panel(routeId => chatLazyChunk(routeId)),
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
				more: {
					lazy: panel(() => moreChunk().then(m => ({ component: m.MorePanel }))),
				},
				notifications: {
					lazy: panel(() => moreChunk().then(m => ({ component: m.NotificationsPanel }))),
				},
				about: {
					lazy: panel(() => moreChunk().then(m => ({ component: m.AboutPanel }))),
				},
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
