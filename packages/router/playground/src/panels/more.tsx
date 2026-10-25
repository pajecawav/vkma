import { useNavigator } from "@vkma.dev/router/preset";
import { Icon24InfoCircleOutline, Icon28SettingsOutline } from "@vkontakte/icons";
import { Cell, CellButton, Footer, Group, PanelHeader } from "@vkontakte/vkui";

export default function MorePanel() {
	const navigator = useNavigator();
	return (
		<>
			<PanelHeader>Ещё</PanelHeader>
			<Group>
				<Cell
					before={<Icon24InfoCircleOutline />}
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
