import { usePanelParams } from "@vkma.dev/router/react";
import type { ReactElement } from "react";
import { meetingOf, showNotice, updateMeeting } from "../../store";
import { MeetingForm } from "./meeting-form";
import { meetingPanel } from "./plans.panel";

export default function EditMeetingModal(): ReactElement {
	const { id } = usePanelParams(meetingPanel);
	const meeting = meetingOf(id);

	return (
		<MeetingForm
			panel={meetingPanel}
			title="Редактирование"
			initial={meeting}
			submitLabel="Сохранить изменения"
			onSave={input => {
				updateMeeting(id, input);
				showNotice("Изменения сохранены до следующей перезагрузки");
			}}
		/>
	);
}
