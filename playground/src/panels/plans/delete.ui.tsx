import { useNavigator } from "@vkma.dev/router/preset";
import { Alert } from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { removeMeeting, showNotice } from "../../store";

interface DeleteMeetingPopoutProps {
	id?: string;
	onClose: () => void;
}

export function DeleteMeetingPopout({ id, onClose }: DeleteMeetingPopoutProps): ReactElement {
	const navigator = useNavigator();
	return (
		<Alert
			title="Удалить встречу?"
			onClosed={onClose}
			description="Действие нельзя отменить. Исходные fixtures восстановятся после перезагрузки."
			actions={[
				{ title: "Отмена", mode: "cancel", action: onClose },
				{
					title: "Удалить",
					mode: "destructive",
					action: () => {
						if (id === undefined) {
							onClose();
							return;
						}
						removeMeeting(id);
						showNotice("Встреча удалена");
						navigator.backToFirst();
					},
				},
			]}
			onClose={onClose}
		/>
	);
}
