import { defineView } from "@vkma.dev/router/preset";
import { ScreenSpinner } from "@vkontakte/vkui";
import { lazy, type ComponentType } from "react";
import { posts } from "../../data";

/** The feed story hub — the only place the "feed" view key is written. */
export const feedView = defineView("feed");

export const feedPanel = feedView.panel(
	"feed",
	{
		loader: async () => {
			await new Promise(resolve => setTimeout(resolve, 700));
			return { posts };
		},
		pendingComponent: () => <ScreenSpinner />,
		staleTime: 30_000,
	},
	() => import("./feed.ui"),
);

/** Route-modal chunks need React.lazy (the Modals host renders entries in
 * Suspense); the module members are addressed by name, so the payload keeps
 * the `{ default }` shape React.lazy expects. */
const lazyModal = <T extends ComponentType>(load: () => Promise<{ default: T }>): ComponentType =>
	lazy(load) as unknown as ComponentType;

/** The typed search shape of the post panel — shared with the UI chunk. */
export type PostSearch = {
	tab?: "comments" | "likes";
};

export const postPanel = feedView.panel(
	"post/$id",
	{
		validateSearch: (search: Record<string, unknown>): PostSearch => ({
			tab:
				search["tab"] === "comments" || search["tab"] === "likes"
					? search["tab"]
					: undefined,
		}),
		modals: {
			comments: lazyModal(() =>
				import("./post-modals").then(m => ({ default: m.CommentsModal })),
			),
			thread: lazyModal(() =>
				import("./post-modals").then(m => ({ default: m.ThreadModal })),
			),
			share: lazyModal(() => import("./post-modals").then(m => ({ default: m.ShareCard }))),
		},
	},
	() => import("./post.ui"),
);
