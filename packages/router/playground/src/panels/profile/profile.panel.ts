import { defineView } from "@vkma.dev/router/preset";

/** The profile story hub — the only place the "profile" view key is written. */
export const profileView = defineView("profile");

export const profilePanel = profileView.panel("index", {}, () => import("./profile.ui"));

import { LogoutPopout } from "../../overlays";

export const profileSettingsPanel = profileView.panel(
	"settings",
	{
		validateSearch: (search: Record<string, unknown>): { section?: "privacy" } => ({
			section: search["section"] === "privacy" ? "privacy" : undefined,
		}),
		// panel-local popout: resolves only while THIS panel is the deepest
		// matched one (the global registry stays free of panel-specific ids)
		popouts: { logout: LogoutPopout },
	},
	() => import("./profile.settings.ui"),
);
