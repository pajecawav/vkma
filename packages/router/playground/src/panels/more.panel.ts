import { definePanel } from "@vkma.dev/router/preset";

/** The "more" story: home panel + two sub-panels, each its own chunk. */
export const morePanel = definePanel("more", "more", {}, () => import("./more"));

export const notificationsPanel = definePanel(
	"more",
	"notifications",
	{},
	() => import("./notifications"),
);

export const aboutPanel = definePanel("more", "about", {}, () => import("./about"));
