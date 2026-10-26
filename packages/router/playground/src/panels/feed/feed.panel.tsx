import { notFound } from "@tanstack/react-router";
import { defineView } from "@vkma.dev/router/preset";
import { ScreenSpinner } from "@vkontakte/vkui";
import { lazy } from "react";
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
		// unknown ids are a 404, not "post №1" — the shell renders the VKUI
		// NotFound for the thrown error
		beforeLoad: ({ params }: { params: { id: string } }) => {
			if (!posts.some(post => post.id === Number(params.id))) {
				throw notFound();
			}
		},
		validateSearch: (search: Record<string, unknown>): PostSearch => ({
			tab:
				search["tab"] === "comments" || search["tab"] === "likes"
					? search["tab"]
					: undefined,
		}),
		modals: {
			comments: {
				component: lazy(() => import("./comments.ui")),
				// NESTED modals: child routes of the comments modal — they stack
				// ON TOP of it instead of replacing it, back unwinds one level
				modals: {
					report: lazy(() => import("./report.ui")),
					share: lazy(() => import("./share.ui")),
				},
			},
			thread: lazy(() => import("./thread.ui")),
			// panel-level share: a SIBLING — showModal on it REPLACES the open
			// modal (old-router chain parity)
			share: lazy(() => import("./share.ui")),
		},
	},
	() => import("./post.ui"),
);
