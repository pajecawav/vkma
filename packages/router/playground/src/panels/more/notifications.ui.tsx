import { useNavigator } from "@vkma.dev/router/preset";
import { Icon24MessageOutline } from "@vkontakte/icons";
import { Group, Header, PanelHeader, PanelHeaderBack, SimpleCell, Switch } from "@vkontakte/vkui";

export default function NotificationsPanel() {
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
