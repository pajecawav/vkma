import { defineView } from "@vkma.dev/router/preset";

/** The profile story hub — the only place the "profile" view key is written. */
export const profileView = defineView("profile");

export const profilePanel = profileView.panel("index", {}, () => import("./profile.ui"));

export const profileSettingsPanel = profileView.panel(
	"settings",
	{
		validateSearch: (search: Record<string, unknown>): { section?: "privacy" } => ({
			section: search["section"] === "privacy" ? "privacy" : undefined,
		}),
	},
	() => import("./profile.settings.ui"),
);
