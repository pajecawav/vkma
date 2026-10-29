import { useNavigator } from "@vkma.dev/router/preset";
import { Icon28Notifications } from "@vkontakte/icons";
import { Cell, CellButton, Footer, Group, PanelHeader } from "@vkontakte/vkui";
import type { ReactElement } from "react";

export default function MorePanel(): ReactElement {
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
					subtitle="глобальная модалка — с любой панели"
					onClick={() => void navigator.showGlobalModal("settings")}
				>
					Настройки
				</CellButton>
			</Group>
			<Group>
				<Footer>@vkma.dev/router · навигация на TanStack Router</Footer>
			</Group>
		</>
	);
}
