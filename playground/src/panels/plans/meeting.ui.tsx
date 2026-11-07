import { useNavigator, usePanelParams, usePanelSearch } from "@vkma.dev/router/preset";
import { Icon28DeleteOutline } from "@vkontakte/icons";
import {
	Box,
	Button,
	ButtonGroup,
	CellButton,
	Group,
	Header,
	HorizontalScroll,
	PanelHeader,
	PanelHeaderBack,
	SimpleCell,
	Tabs,
	TabsItem,
	Text,
	Title,
} from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { personOf } from "../../data";
import { meetingOf, usePlannerState } from "../../store";
import { InitialsAvatar } from "../../ui";
import { meetingPanel } from "./plans.panel";

export default function MeetingPanel(): ReactElement {
	const navigator = useNavigator();
	const { id } = usePanelParams(meetingPanel);
	const search = usePanelSearch(meetingPanel);
	const { meetings } = usePlannerState();
	const meeting = meetingOf(id);
	const organizer = personOf(meeting.organizerId);
	const currentIndex = meetings.findIndex(candidate => candidate.id === id);
	const nextMeeting = meetings[(currentIndex + 1) % meetings.length];
	const tab = search?.tab;

	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				Встреча
			</PanelHeader>
			<Group>
				<Box padding="m">
					<Title level="2">{meeting.title}</Title>
					<Text style={{ display: "block", marginTop: 8 }}>
						{meeting.day} · {meeting.time}
					</Text>
					<Text
						style={{
							display: "block",
							marginTop: 4,
							color: "var(--vkui--color_text_secondary)",
						}}
					>
						{meeting.place}
					</Text>
				</Box>
				<HorizontalScroll>
					<Tabs withScrollToSelectedTab>
						<TabsItem
							id="meeting-tab-details"
							selected={tab === undefined}
							aria-controls="meeting-content"
							onClick={() =>
								void navigator.replace(
									meetingPanel,
									{ id },
									{ search: { tab: undefined } },
								)
							}
						>
							О встрече
						</TabsItem>
						<TabsItem
							id="meeting-tab-people"
							selected={tab === "people"}
							aria-controls="meeting-content"
							onClick={() =>
								void navigator.replace(
									meetingPanel,
									{ id },
									{ search: { tab: "people" } },
								)
							}
						>
							Участники · {meeting.attendeeIds.length}
						</TabsItem>
					</Tabs>
				</HorizontalScroll>
			</Group>
			<div id="meeting-content">
				{tab === "people" ? (
					<Group header={<Header size="s">Кто придёт</Header>}>
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
				) : (
					<Group header={<Header size="s">Повестка</Header>}>
						<Box padding="m" style={{ paddingTop: 0 }}>
							<Text>{meeting.description || "Организатор не добавил описание."}</Text>
						</Box>
						<SimpleCell
							before={<InitialsAvatar name={organizer.name} size={36} />}
							subtitle="Организатор"
						>
							{organizer.name}
						</SimpleCell>
					</Group>
				)}
			</div>
			<Group>
				<Box padding="m">
					<ButtonGroup stretched gap="s" align="center">
						<Button
							mode="secondary"
							stretched
							onClick={() =>
								void navigator.showModal({
									to: "/meeting/$id/edit",
									params: { id },
								})
							}
						>
							Изменить
						</Button>
						<Button
							mode="secondary"
							stretched
							onClick={() =>
								void navigator.showModal({
									to: "/meeting/$id/share",
									params: { id },
									props: { note: "Ссылка откроет именно эту встречу" },
								})
							}
						>
							Поделиться
						</Button>
					</ButtonGroup>
				</Box>
				<CellButton
					subtitle="Приглашения, шеринг и удаление собраны в одном окне"
					onClick={() =>
						void navigator.showModal({ to: "/meeting/$id/attendees", params: { id } })
					}
				>
					Участники и приглашения
				</CellButton>
				<CellButton
					appearance="negative"
					before={<Icon28DeleteOutline />}
					subtitle="Зафиксируем в приложении и подтвердим ещё раз"
					onClick={() => navigator.showPopout("delete", { id })}
				>
					Удалить встречу
				</CellButton>
			</Group>
			<Group>
				{nextMeeting !== undefined && nextMeeting.id !== id && (
					<CellButton
						subtitle="Открывает встречу прямо из этой панели"
						onClick={() => void navigator.push(meetingPanel, { id: nextMeeting.id })}
					>
						Следующая встреча
					</CellButton>
				)}
				<CellButton
					subtitle="Быстрый возврат к расписанию"
					onClick={() => navigator.backToFirst()}
				>
					К расписанию
				</CellButton>
			</Group>
		</>
	);
}
