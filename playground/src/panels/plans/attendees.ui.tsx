import { ModalPageSurface, useNavigator, usePanelParams } from "@vkma.dev/router/preset";
import { CellButton, Group, ModalPageHeader, PanelHeaderClose, SimpleCell } from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { personOf } from "../../data";
import { meetingOf } from "../../store";
import { InitialsAvatar } from "../../ui";
import { meetingPanel } from "./plans.panel";

export default function AttendeesModal(): ReactElement {
	const navigator = useNavigator();
	const { id } = usePanelParams(meetingPanel);
	const meeting = meetingOf(id);

	return (
		<ModalPageSurface
			header={
				<ModalPageHeader
					before={<PanelHeaderClose onClick={() => navigator.hideModal()} />}
				>
					Участники · {meeting.attendeeIds.length}
				</ModalPageHeader>
			}
		>
			<Group>
				{meeting.attendeeIds.map(personId => {
					const person = personOf(personId);
					return (
						<SimpleCell
							key={personId}
							before={<InitialsAvatar name={person.name} size={40} />}
							subtitle={person.role}
						>
							{person.name}
						</SimpleCell>
					);
				})}
			</Group>
			<Group>
				<CellButton
					subtitle="nested modal · back вернёт к участникам"
					onClick={() =>
						void navigator.showModal({
							to: "/meeting/$id/attendees/invite",
							params: { id },
						})
					}
				>
					Пригласить друзей
				</CellButton>
				<CellButton
					subtitle="nested ModalCard с runtime props"
					onClick={() =>
						void navigator.showModal({
							to: "/meeting/$id/attendees/share",
							params: { id },
							props: { note: "Отправьте ссылку тем, кого добавили в список" },
						})
					}
				>
					Поделиться списком
				</CellButton>
				<CellButton
					subtitle="sibling replace · back вернётся сразу на панель"
					onClick={() =>
						void navigator.showModal({ to: "/meeting/$id/edit", params: { id } })
					}
				>
					Изменить встречу
				</CellButton>
			</Group>
		</ModalPageSurface>
	);
}
