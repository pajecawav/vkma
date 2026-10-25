import { definePanel } from "@vkma.dev/router/preset";

/** The profile story: home panel + settings panel with typed search. */
export const profilePanel = definePanel("profile", "index", {}, () => import("./profile"));

export const profileSettingsPanel = definePanel(
	"profile",
	"settings",
	{
		validateSearch: (search: Record<string, unknown>): { section?: "privacy" } => ({
			section: search["section"] === "privacy" ? "privacy" : undefined,
		}),
	},
	() => import("./profile.settings"),
);
