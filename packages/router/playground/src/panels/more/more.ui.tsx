import { useNavigator } from "@vkma.dev/router/preset";
import { Icon28InfoOutline, Icon28Notifications, Icon28SettingsOutline } from "@vkontakte/icons";
import { Cell, CellButton, Footer, Group, PanelHeader } from "@vkontakte/vkui";

export default function MorePanel() {
	const navigator = useNavigator();
	return (
		<>
			<PanelHeader>Ещё</PanelHeader>
			<Group>
				<Cell
					before={<Icon28Notifications />}
					chevron="always"
					onClick={() => void navigator.push({ to: "/notifications" })}
				>
					Уведомления
				</Cell>
				<CellButton
					before={<Icon28SettingsOutline />}
					subtitle="глобальная модалка — с любой панели"
					onClick={() => void navigator.showGlobalModal("settings")}
				>
					Настройки
				</CellButton>
				<Cell
					before={<Icon28InfoOutline />}
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
