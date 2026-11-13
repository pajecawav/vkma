import { notFound } from "@tanstack/react-router";
import { defineView, modalProps } from "@vkma.dev/router/preset";
import { PanelHeader, ScreenSpinner } from "@vkontakte/vkui";
import { lazy } from "react";
import { findMeeting, type MeetingFilter } from "../../store";
import { DeleteMeetingPopout } from "./delete.ui";

export const plansView = defineView("plans");

export type PlansSearch = { filter?: MeetingFilter };

export const plansPanel = plansView.panel(
	"index",
	{
		validateSearch: (search: Record<string, unknown>): PlansSearch => ({
			filter:
				search["filter"] === "mine" || search["filter"] === "weekend"
					? search["filter"]
					: undefined,
		}),
		loader: async () => {
			await new Promise(resolve => setTimeout(resolve, 450));
			return { ready: true };
		},
		pendingComponent: () => (
			<>
				<PanelHeader>Планы</PanelHeader>
				<ScreenSpinner />
			</>
		),
		staleTime: 30_000,
	},
	() => import("./plans.ui"),
);

export type MeetingSearch = { tab?: "people" };

export const meetingPanel = plansView.panel(
	"meeting/$id",
	{
		beforeLoad: ({ params }: { params: { id: string } }) => {
			if (findMeeting(params.id) === undefined) {
				throw notFound();
			}
		},
		validateSearch: (search: Record<string, unknown>): MeetingSearch => ({
			tab: search["tab"] === "people" ? "people" : undefined,
		}),
		modals: {
			edit: lazy(() => import("./edit.ui")),
			// props: TYPE-ONLY carrier — the value is never read, the phantom
			// types showModal(...) and useModalProps(handle)
			share: {
				component: lazy(() => import("./share.ui")),
				props: modalProps<{ note?: string }>(),
			},
			attendees: {
				component: lazy(() => import("./attendees.ui")),
				modals: {
					invite: lazy(() => import("./invite.ui")),
					share: {
						component: lazy(() => import("./share.ui")),
						props: modalProps<{ note?: string }>(),
					},
				},
			},
		},
		popouts: { delete: DeleteMeetingPopout },
	},
	() => import("./meeting.ui"),
);
