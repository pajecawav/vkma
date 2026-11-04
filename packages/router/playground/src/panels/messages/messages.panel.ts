import { redirect } from "@tanstack/react-router";
import { defineView } from "@vkma.dev/router/preset";

/** The messages story hub, the only place the "messages" view key is written. */
export const messagesView = defineView("messages");

/** The typed search shape of the chats panel, carries the redirect trace. */
export type ChatsSearch = {
	redirectedFrom?: string;
};

export const chatsPanel = messagesView.panel(
	"messages",
	{
		validateSearch: (search: Record<string, unknown>): ChatsSearch => ({
			redirectedFrom:
				typeof search["redirectedFrom"] === "string" ? search["redirectedFrom"] : undefined,
		}),
	},
	() => import("./messages.ui"),
);

export const chatPanel = messagesView.panel(
	"chat/$id",
	{
		beforeLoad: ({ params }: { params: { id: string } }) => {
			if (params.id === "bot") {
				// the redirect leaves a trace in the target's typed search. The
				// chats panel surfaces it as a snackbar; without it the feature
				// would be completely invisible
				throw redirect({ to: "/messages", search: { redirectedFrom: "bot" } });
			}
		},
	},
	() => import("./chat.ui"),
);
