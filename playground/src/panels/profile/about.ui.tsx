import { useNavigator } from "@vkma.dev/router/preset";
import {
	Box,
	Cell,
	CellButton,
	Footer,
	Group,
	Header,
	PanelHeader,
	PanelHeaderBack,
	Text,
	Title,
} from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { showPlannerTour } from "../../bridge-actions";

interface ChecklistItem {
	href: string;
	title: string;
	description: string;
}

const PANEL_SCENARIOS: ChecklistItem[] = [
	{
		href: "#/",
		title: "Список встреч",
		description: "Корневой маршрут, фильтры и возврат на первую панель.",
	},
	{
		href: "#/meeting/navigation?tab=people",
		title: "Typed search",
		description: "Открыть встречу сразу на вкладке участников.",
	},
	{
		href: "#/meeting/navigation/attendees",
		title: "Участники встречи",
		description: "Вложенная панель и навигация назад по истории.",
	},
	{
		href: "#/meeting/navigation/edit",
		title: "Редактирование",
		description: "Форма встречи и сохранение изменений в store.",
	},
];

const OVERLAY_SCENARIOS: ChecklistItem[] = [
	{
		href: "#/meeting/navigation/attendees/share",
		title: "Модалка шеринга",
		description: "Локальный route modal с естественным возвратом назад.",
	},
	{
		href: "?modal=settings",
		title: "Глобальные настройки",
		description: "Модалка доступна поверх любой панели и сохраняет реальные настройки.",
	},
	{
		href: "#/invitation/expired",
		title: "Redirect из beforeLoad",
		description: "Истёкшее приглашение заменяется списком с уведомлением.",
	},
	{
		href: "#/nowhere",
		title: "Неизвестный маршрут",
		description: "Проверка VKUI NotFound вместо fallback на первый story.",
	},
];

function ScenarioLinks({ items }: { items: ChecklistItem[] }): ReactElement {
	return (
		<>
			{items.map(item => (
				<Cell
					key={item.href}
					Component="a"
					href={item.href}
					chevron="always"
					multiline
					subtitle={`${item.href} — ${item.description}`}
				>
					{item.title}
				</Cell>
			))}
		</>
	);
}

export default function AboutPanel(): ReactElement {
	const navigator = useNavigator();

	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				О приложении
			</PanelHeader>
			<Group>
				<Box style={{ display: "grid", gap: 8, padding: 20 }}>
					<Title level="2">Планировщик встреч</Title>
					<Text>
						Playground для ручной проверки @vkma.dev/router, VK Bridge и VKUI. Встречи и
						приглашения используют демонстрационные данные, а настройки сохраняются
						через VK Storage.
					</Text>
				</Box>
			</Group>
			<Group>
				<CellButton
					subtitle="VKWebAppShowSlidesSheet с реальными confirm/cancel/reject"
					onClick={() => void showPlannerTour()}
				>
					Запустить native-тур
				</CellButton>
			</Group>
			<Group
				header={
					<Header size="m" subtitle="Каждая строка открывает отдельный сценарий">
						Ручной чеклист
					</Header>
				}
			>
				<ScenarioLinks items={PANEL_SCENARIOS} />
			</Group>
			<Group header={<Header size="s">Оверлеи, guard и ошибки</Header>}>
				<ScenarioLinks items={OVERLAY_SCENARIOS.slice(0, 1)} />
				<Cell
					Component="a"
					href="?modal=settings"
					chevron="always"
					multiline
					subtitle="?modal=settings — модалка доступна поверх любой панели и сохраняет реальные настройки."
					onClick={event => {
						event.preventDefault();
						void navigator.showGlobalModal("settings");
					}}
				>
					Глобальные настройки
				</Cell>
				<ScenarioLinks items={OVERLAY_SCENARIOS.slice(2)} />
			</Group>
			<Group>
				<Footer>
					Для полной проверки также используйте системную кнопку назад и swipe-back на
					устройстве.
				</Footer>
			</Group>
		</>
	);
}
