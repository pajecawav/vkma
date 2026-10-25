import { useNavigator } from "@vkma.dev/router/preset";
import {
	Icon24InfoCircleOutline,
	Icon24NotificationOutline,
	Icon28SettingsOutline,
	Icon24MessageOutline,
} from "@vkontakte/icons";
import {
	Cell,
	CellButton,
	Footer,
	Group,
	Header,
	PanelHeader,
	PanelHeaderBack,
	SimpleCell,
	Switch,
} from "@vkontakte/vkui";

export function MorePanel() {
	const navigator = useNavigator();
	return (
		<>
			<PanelHeader>Ещё</PanelHeader>
			<Group>
				<Cell
					before={<Icon24NotificationOutline />}
					chevron="always"
					onClick={() => void navigator.push({ to: "/notifications" })}
				>
					Уведомления
				</Cell>
				<CellButton
					before={<Icon28SettingsOutline />}
					onClick={() => void navigator.showGlobalModal("settings")}
				>
					Настройки (глобальная модалка)
				</CellButton>
				<Cell
					before={<Icon24InfoCircleOutline />}
					chevron="always"
					onClick={() => void navigator.push({ to: "/about" })}
				>
					О приложении
				</Cell>
			</Group>
			<Group>
				<Footer>@vkma.dev/router · витрина на TanStack Router</Footer>
			</Group>
		</>
	);
}

export function NotificationsPanel() {
	const navigator = useNavigator();
	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				Уведомления
			</PanelHeader>
			<Group>
				<SimpleCell Component="label" after={<Switch />}>
					Выключить все уведомления
				</SimpleCell>
			</Group>
			<Group header={<Header size="s">Системные настройки</Header>}>
				<SimpleCell
					Component="label"
					subtitle="Push не приходят, пока приложение открыто"
					after={<Switch defaultChecked />}
				>
					Баннер
				</SimpleCell>
				<SimpleCell Component="label" after={<Switch />}>
					Звук и вибрация
				</SimpleCell>
			</Group>
			<Group>
				<SimpleCell
					before={<Icon24MessageOutline />}
					Component="label"
					after={<Switch defaultChecked />}
				>
					Уведомления о сообщениях
				</SimpleCell>
			</Group>
		</>
	);
}

export function AboutPanel() {
	const navigator = useNavigator();
	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				О приложении
			</PanelHeader>
			<Group>
				<Group mode="plain">
					<SimpleCell indicator="0.1.0">Версия</SimpleCell>
					<SimpleCell indicator="Русский">Язык приложения</SimpleCell>
					<Footer>
						Витрина @vkma.dev/router: панели, модалки-маршруты, попауты, инфлейт.
					</Footer>
				</Group>
			</Group>
		</>
	);
}
