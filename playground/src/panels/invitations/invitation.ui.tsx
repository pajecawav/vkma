import { createVkLink, useNavigator, usePanelParams } from "@vkma.dev/router/preset";
import {
	Icon28CalendarOutline,
	Icon28CancelOutline,
	Icon28CheckCircleOutline,
	Icon28ClockOutline,
	Icon28PlaceOutline,
} from "@vkontakte/icons";
import {
	Box,
	Button,
	ButtonGroup,
	CellButton,
	Group,
	Header,
	PanelHeader,
	PanelHeaderBack,
	SimpleCell,
	Text,
	Title,
} from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { personOf, type InvitationStatus } from "../../data";
import { answerInvitation, invitationOf, showNotice, usePlannerState } from "../../store";
import { InitialsAvatar } from "../../ui";
import { invitationPanel, invitationsPanel } from "./invitations.panel";

const CellButtonLink = createVkLink(CellButton);

function answerNotice(status: Exclude<InvitationStatus, "pending">): string {
	return status === "accepted"
		? "Приглашение принято. Встреча добавлена в ваше расписание."
		: "Приглашение отклонено.";
}

export default function InvitationPanel(): ReactElement {
	const navigator = useNavigator();
	const { id } = usePanelParams(invitationPanel);
	usePlannerState();
	const invitation = invitationOf(id);
	const sender = personOf(invitation.fromId);

	const answer = (status: Exclude<InvitationStatus, "pending">): void => {
		if (invitation.status !== "pending") {
			return;
		}
		answerInvitation(invitation.id, status);
		showNotice(answerNotice(status));
	};

	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				Приглашение
			</PanelHeader>
			<Group>
				<Box
					style={{
						display: "flex",
						alignItems: "center",
						gap: 16,
						padding: 20,
					}}
				>
					<InitialsAvatar name={sender.name} size={72} />
					<Box style={{ minWidth: 0 }}>
						<Title level="2">{invitation.title}</Title>
						<Text style={{ color: "var(--vkui--color_text_secondary)" }}>
							Приглашает {sender.name}
						</Text>
					</Box>
				</Box>
			</Group>
			<Group header={<Header size="s">Детали</Header>}>
				<SimpleCell before={<Icon28CalendarOutline />}>{invitation.day}</SimpleCell>
				<SimpleCell before={<Icon28ClockOutline />}>{invitation.time}</SimpleCell>
				<SimpleCell before={<Icon28PlaceOutline />} multiline>
					{invitation.place}
				</SimpleCell>
			</Group>
			<Group header={<Header size="s">Сообщение</Header>}>
				<Box style={{ padding: "0 16px 16px" }}>
					<Text>{invitation.note}</Text>
				</Box>
			</Group>
			{invitation.status === "pending" ? (
				<Group>
					<Box style={{ padding: 16 }}>
						<ButtonGroup mode="horizontal" gap="m" stretched>
							<Button size="l" stretched onClick={() => answer("accepted")}>
								Принять
							</Button>
							<Button
								size="l"
								stretched
								mode="secondary"
								onClick={() => answer("declined")}
							>
								Отклонить
							</Button>
						</ButtonGroup>
					</Box>
				</Group>
			) : (
				<Group header={<Header size="s">Ваш ответ</Header>}>
					<SimpleCell
						before={
							invitation.status === "accepted" ? (
								<Icon28CheckCircleOutline
									style={{ color: "var(--vkui--color_icon_positive)" }}
								/>
							) : (
								<Icon28CancelOutline />
							)
						}
						subtitle={
							invitation.status === "accepted"
								? "Встреча уже есть в вашем расписании"
								: "Изменить ответ на это приглашение нельзя"
						}
						multiline
					>
						{invitation.status === "accepted"
							? "Приглашение принято"
							: "Приглашение отклонено"}
					</SimpleCell>
					<CellButtonLink page={invitationsPanel}>
						Вернуться к приглашениям
					</CellButtonLink>
				</Group>
			)}
		</>
	);
}
