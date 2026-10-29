import { defineView } from "@vkma.dev/router/preset";

/** The "more" story hub — the only place the "more" view key is written. */
export const moreView = defineView("more");

export const morePanel = moreView.panel("more", {}, () => import("./more.ui"));

export const notificationsPanel = moreView.panel(
	"notifications",
	{},
	() => import("./notifications.ui"),
);

export const aboutPanel = moreView.panel("about", {}, () => import("./about.ui"));
