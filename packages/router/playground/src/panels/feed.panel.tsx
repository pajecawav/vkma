import { definePanel } from "@vkma.dev/router/preset";
import { ScreenSpinner } from "@vkontakte/vkui";
import { posts } from "../data";

/**
 * The feed panel definition — the typed handle the panel chunk (and any
 * sibling) imports instead of the app. Kept deliberately light: the loader
 * and a spinner only, the UI lives in the lazy chunk.
 */
export const feedPanel = definePanel(
	"feed",
	"feed",
	{
		loader: async () => {
			await new Promise(resolve => setTimeout(resolve, 700));
			return { posts };
		},
		pendingComponent: () => <ScreenSpinner style={{ height: "100vh" }} />,
		staleTime: 30_000,
	},
	() => import("./feed"),
);
