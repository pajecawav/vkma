import { defineGlobalModal } from "@vkma.dev/router/preset";
import type { ReactElement } from "react";
import { addMeeting, showNotice } from "../../store";
import { MeetingForm } from "./meeting-form";
import { plansPanel } from "./plans.panel";

export default function CreateMeetingModal(): ReactElement {
	return (
		<MeetingForm
			panel={plansPanel}
			title="Новая встреча"
			submitLabel="Создать встречу"
			onSave={input => {
				addMeeting(input);
				showNotice("Встреча добавлена в планы");
			}}
		/>
	);
}

/** The typed handle for `showGlobalModal(createMeetingModal)`. */
export const createMeetingModal = defineGlobalModal("create", {
	component: CreateMeetingModal,
});
