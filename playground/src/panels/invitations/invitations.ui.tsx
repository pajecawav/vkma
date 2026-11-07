import { createVkLink, useNavigator, usePanelSearch } from "@vkma.dev/router/preset";
import { Caption, Footer, Group, Header, PanelHeader, RichCell, SimpleCell } from "@vkontakte/vkui";
import { useEffect, type ReactElement } from "react";
import { personOf, type Invitation } from "../../data";
import { showNotice, usePlannerState } from "../../store";
import { InitialsAvatar } from "../../ui";
import { invitationPanel, invitationsPanel } from "./invitations.panel";

const RichCellLink = createVkLink(RichCell);

function invitationStatus(invitation: Invitation): string {
	if (invitation.id === "expired") {
		return "Срок истёк";
	}
	switch (invitation.status) {
		case "pending":
			return "Ждёт ответа";
		case "accepted":
			return "Принято";
		case "declined":
			return "Отклонено";
	}
}

function statusColor(invitation: Invitation): string {
	if (invitation.status === "accepted") {
		return "var(--vkui--color_text_positive)";
	}
	if (invitation.status === "pending") {
		return "var(--vkui--color_text_accent)";
	}
	return "var(--vkui--color_text_secondary)";
}

function InvitationRow({ invitation }: { invitation: Invitation }): ReactElement {
	const sender = personOf(invitation.fromId);

	return (
		<RichCellLink
			multiline
			before={<InitialsAvatar name={sender.name} size={48} />}
			overTitle={sender.name}
			subtitle={`${invitation.day}, ${invitation.time}`}
			extraSubtitle={invitation.place}
			meta={
				<Caption style={{ color: statusColor(invitation) }}>
					{invitationStatus(invitation)}
				</Caption>
			}
			page={invitationPanel}
			params={{ id: invitation.id }}
			aria-label={`${invitation.title}. ${invitationStatus(invitation)}`}
		>
			{invitation.title}
		</RichCellLink>
	);
}

export default function InvitationsPanel(): ReactElement {
	const navigator = useNavigator();
	const { invitations } = usePlannerState();
	const redirectedFrom = usePanelSearch(invitationsPanel)?.redirectedFrom;
	const pending = invitations.filter(invitation => invitation.status === "pending");
	const answered = invitations.filter(invitation => invitation.status !== "pending");

	useEffect(() => {
		if (redirectedFrom !== "expired") {
			return;
		}
		showNotice("Срок ответа на приглашение истёк. Выберите актуальное из списка.");
		// The marker is single-use: returning to this entry later must not replay the notice.
		void navigator.replace({ to: "/invitations", search: {} });
	}, [navigator, redirectedFrom]);

	return (
		<>
			<PanelHeader>Приглашения</PanelHeader>
			<Group
				header={
					<Header size="s" indicator={pending.length}>
						Ожидают ответа
					</Header>
				}
			>
				{pending.length > 0 ? (
					pending.map(invitation => (
						<InvitationRow key={invitation.id} invitation={invitation} />
					))
				) : (
					<SimpleCell subtitle="Новые приглашения появятся здесь">
						Новых приглашений нет
					</SimpleCell>
				)}
			</Group>
			{answered.length > 0 && (
				<Group header={<Header size="s">История</Header>}>
					{answered.map(invitation => (
						<InvitationRow key={invitation.id} invitation={invitation} />
					))}
				</Group>
			)}
			<Group>
				<Footer>Принятые приглашения добавляются в общий список встреч.</Footer>
			</Group>
		</>
	);
}
