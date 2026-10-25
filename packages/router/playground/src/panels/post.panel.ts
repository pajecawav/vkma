import { definePanel } from "@vkma.dev/router/preset";
import { lazy } from "react";
import type { ComponentType } from "react";

/** Route-modal chunks need React.lazy (the Modals host renders entries in
 * Suspense); the module members are addressed by name, so the payload keeps
 * the `{ default }` shape React.lazy expects. */
const lazyModal = <T extends ComponentType>(load: () => Promise<{ default: T }>): ComponentType =>
	lazy(load) as unknown as ComponentType;

/** The typed search shape of the post panel — shared with the UI chunk. */
export type PostSearch = {
	tab?: "comments" | "likes";
};

/** The post panel with its route-modal chain (comments → thread / share). */
export const postPanel = definePanel(
	"feed",
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
