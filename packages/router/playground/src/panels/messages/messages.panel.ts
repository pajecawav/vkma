import { redirect } from "@tanstack/react-router";
import { defineView } from "@vkma.dev/router/preset";

/** The messages story hub — the only place the "messages" view key is written. */
export const messagesView = defineView("messages");

export const chatsPanel = messagesView.panel("messages", {}, () => import("./messages.ui"));

export const chatPanel = messagesView.panel(
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
