import { createVkLink, useNavigator } from "@vkma.dev/router/preset";
import { Icon28Notifications } from "@vkontakte/icons";
import { Cell, CellButton, Footer, Group, PanelHeader } from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { settingsModal } from "../../overlays";
import { notificationsPanel } from "./more.panel";

const CellLink = createVkLink(Cell);

export default function MorePanel(): ReactElement {
	const navigator = useNavigator();

	return (
		<>
			<PanelHeader>Ещё</PanelHeader>
			<Group>
				<CellLink
					before={<Icon28Notifications />}
					chevron="always"
					page={notificationsPanel}
				>
					Уведомления
				</CellLink>
				<CellButton
					subtitle="глобальная модалка — с любой панели"
					onClick={() => void navigator.showGlobalModal(settingsModal)}
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
