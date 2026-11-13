import { createVkLink, useNavigator, usePanelSearch } from "@vkma.dev/router/preset";
import {
	CellButton,
	Footer,
	Group,
	Header,
	HorizontalScroll,
	PanelHeader,
	Placeholder,
	RichCell,
	Tabs,
	TabsItem,
} from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { personOf } from "../../data";
import { usePlannerState, type MeetingFilter } from "../../store";
import { InitialsAvatar } from "../../ui";
import { createMeetingModal } from "./create.ui";
import { meetingPanel, plansPanel } from "./plans.panel";

const RichCellLink = createVkLink(RichCell);

const FILTERS: Array<{ id: MeetingFilter; label: string }> = [
	{ id: "all", label: "Все" },
	{ id: "mine", label: "Мои" },
	{ id: "weekend", label: "Выходные" },
];

export default function PlansPanel(): ReactElement {
	const navigator = useNavigator();
	const search = usePanelSearch(plansPanel);
	const { meetings, settings } = usePlannerState();
	const filter = search?.filter ?? settings.defaultFilter;
	const visible = meetings.filter(meeting => {
		if (filter === "mine") {
			return meeting.organizerId === "me";
		}
		if (filter === "weekend") {
			return meeting.day === "Суббота";
		}
		return true;
	});

	return (
		<>
			<PanelHeader>Расписание</PanelHeader>
			<Group>
				<HorizontalScroll>
					<Tabs withScrollToSelectedTab>
						{FILTERS.map(item => (
							<TabsItem
								key={item.id}
								id={`plans-tab-${item.id}`}
								selected={filter === item.id}
								aria-controls="plans-list"
								onClick={() =>
									void navigator.replace({
										to: "/",
										search: { filter: item.id === "all" ? undefined : item.id },
									})
								}
							>
								{item.label}
							</TabsItem>
						))}
					</Tabs>
				</HorizontalScroll>
			</Group>
			<Group
				id="plans-list"
				header={
					<Header size="s" subtitle={`${visible.length} в расписании`}>
						Ближайшие встречи
					</Header>
				}
			>
				{visible.map(meeting => {
					const organizer = personOf(meeting.organizerId);
					return (
						<RichCellLink
							key={meeting.id}
							page={meetingPanel}
							params={{ id: meeting.id }}
							preload="intent"
							multiline={!settings.compactList}
							before={<InitialsAvatar name={organizer.name} size={44} />}
							subtitle={`${meeting.day} · ${meeting.time}`}
							extraSubtitle={meeting.place}
						>
							{meeting.title}
						</RichCellLink>
					);
				})}
				{visible.length === 0 && (
					<Placeholder title="Здесь пока свободно">
						Создайте встречу или смените фильтр расписания.
					</Placeholder>
				)}
				<CellButton
					onClick={() => void navigator.showGlobalModal(createMeetingModal)}
					subtitle="Добавьте время, место и описание"
				>
					Новая встреча
				</CellButton>
			</Group>
			<Footer>
				Расписание хранится внутри приложения, пока оно открыто. Фильтр по умолчанию
				сохраняется на следующий запуск.
			</Footer>
		</>
	);
}
