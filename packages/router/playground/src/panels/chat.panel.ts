import { redirect } from "@tanstack/react-router";
import { definePanel } from "@vkma.dev/router/preset";

/** The chat thread panel: a beforeLoad redirect away from the "bot" chat. */
export const chatPanel = definePanel(
	"messages",
	"chat/$id",
	{
		beforeLoad: ({ params }: { params: { id: string } }) => {
			if (params.id === "bot") {
				throw redirect({ to: "/messages" });
			}
		},
	},
	() => import("./chat.ui"),
);
