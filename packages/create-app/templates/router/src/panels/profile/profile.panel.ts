import { defineView } from "@vkma.dev/router/preset";

/** The profile story hub — the only place the "profile" view key is written. */
export const profileView = defineView("profile");

// "index" is the panel path that owns "/" — exactly one view may have it.
export const profilePanel = profileView.panel("index", {}, () => import("./profile.ui"));

export const profileSettingsPanel = profileView.panel(
	"settings",
	{},
	() => import("./settings.ui"),
);
