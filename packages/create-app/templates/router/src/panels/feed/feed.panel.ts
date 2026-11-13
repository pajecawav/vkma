import { defineView, modalProps } from "@vkma.dev/router/preset";
import { lazy } from "react";

/** The feed story hub, the only place the "feed" view key is written. */
export const feedView = defineView("feed");

export const feedPanel = feedView.panel("feed", {}, () => import("./feed.ui"));

// "$id" declares a path param, typed via the panel handle, no manual parsing.
// `modals` declares route modals: masked child routes of this panel. The
// `props` member is a TYPE-ONLY carrier (modalProps<T>() — the value is
// never read): its phantom types showModal(postPanel.modals.share,
// { params, props }) and useModalProps(postPanel.modals.share) in the chunk.
export const postPanel = feedView.panel(
	"post/$id",
	{
		modals: {
			share: {
				component: lazy(() => import("./share.ui")),
				props: modalProps<{ note?: string }>(),
			},
		},
	},
	() => import("./post.ui"),
);
