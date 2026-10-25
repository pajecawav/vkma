import { defineView, lazyModal } from "@vkma.dev/router/preset";
import { ScreenSpinner } from "@vkontakte/vkui";
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
			comments: lazyModal(() => import("./comments.ui")),
			thread: lazyModal(() => import("./thread.ui")),
			share: lazyModal(() => import("./share.ui")),
		},
	},
	() => import("./post.ui"),
);
