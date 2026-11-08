import { notFound, redirect } from "@tanstack/react-router";
import { defineView } from "@vkma.dev/router/preset";
import { invitationOf } from "../../store";

export interface InvitationsSearch {
	redirectedFrom?: string;
}

/** The invitations story hub, the only place the "invitations" view key is written. */
export const invitationsView = defineView("invitations");

export const invitationsPanel = invitationsView.panel(
	"invitations",
	{
		validateSearch: (search: Record<string, unknown>): InvitationsSearch => {
			return typeof search["redirectedFrom"] === "string"
				? { redirectedFrom: search["redirectedFrom"] }
				: {};
		},
	},
	() => import("./invitations.ui"),
);

export const invitationPanel = invitationsView.panel(
	"invitation/$id",
	{
		beforeLoad: ({ params }: { params: { id: string } }) => {
			if (params.id === "expired") {
				throw redirect({
					to: "/invitations",
					search: { redirectedFrom: "expired" },
				});
			}

			try {
				invitationOf(params.id);
			} catch {
				throw notFound();
			}
		},
	},
	() => import("./invitation.ui"),
);
