import bridge from "@vkma.dev/bridge";
import { DefaultPanelPendingComponent, defineView } from "@vkma.dev/router/preset";
import { errorText } from "../../store";

export interface ProfileSettingsSearch {
	section?: "privacy";
}

/** The profile story hub, the only place the "profile" view key is written. */
export const profileView = defineView("profile");

export const profilePanel = profileView.panel(
	"profile",
	{
		loader: async () => {
			try {
				return { user: await bridge.send("VKWebAppGetUserInfo"), error: null };
			} catch (error) {
				return { user: null, error: errorText(error) };
			}
		},
		staleTime: 60_000,
		pendingComponent: DefaultPanelPendingComponent,
	},
	() => import("./profile.ui"),
);

export const profileSettingsPanel = profileView.panel(
	"settings",
	{
		validateSearch: (search: Record<string, unknown>): ProfileSettingsSearch => {
			return search["section"] === "privacy" ? { section: "privacy" } : {};
		},
	},
	() => import("./settings.ui"),
);

export const aboutPanel = profileView.panel("about", {}, () => import("./about.ui"));
