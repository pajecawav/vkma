import bridge from "@vkma.dev/bridge";
import { defineView } from "@vkma.dev/router/preset";

/** The profile story hub — the only place the "profile" view key is written. */
export const profileView = defineView("profile");

// "index" is the panel path that owns "/" — exactly one view may have it.
// The loader fetches BEFORE the panel mounts; until the host answers with
// VKWebAppGetUserInfoResult the panel holds the pending fallback.
export const profilePanel = profileView.panel(
	"index",
	{
		loader: async () => ({ user: await bridge.send("VKWebAppGetUserInfo") }),
	},
	() => import("./profile.ui"),
);

export const profileSettingsPanel = profileView.panel(
	"settings",
	{},
	() => import("./settings.ui"),
);
