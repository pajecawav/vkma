import bridge from "@vkma.dev/bridge";
import { defineView } from "@vkma.dev/router/preset";

/** The profile story hub, the only place the "profile" view key is written. */
export const profileView = defineView("profile");

// "index" is the panel path that owns "/". Exactly one view may have it.
// The loader fetches BEFORE the panel mounts; until the host answers with
// VKWebAppGetUserInfoResult the panel holds the pending fallback. The
// timeout keeps a plain browser tab (no VK host, so no answer ever) from
// freezing the first render forever: past it the panel mounts with the
// null user and shows its stub.
export const profilePanel = profileView.panel(
	"index",
	{
		loader: async () => {
			try {
				return {
					user: await bridge.send("VKWebAppGetUserInfo", undefined, { timeout: 1500 }),
				};
			} catch {
				return { user: null };
			}
		},
	},
	() => import("./profile.ui"),
);

export const profileSettingsPanel = profileView.panel(
	"settings",
	{},
	() => import("./settings.ui"),
);
