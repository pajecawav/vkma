import { useNavigator } from "@vkma.dev/router/preset";
import {
	CellButton,
	Footer,
	Group,
	PanelHeader,
	PanelHeaderBack,
	SimpleCell,
} from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { logoutPopout } from "../../overlays";

export default function ProfileSettingsPanel(): ReactElement {
	const navigator = useNavigator();

	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				Настройки
			</PanelHeader>
			<Group>
				<SimpleCell subtitle="глубокая ссылка /settings">Экран настроек профиля</SimpleCell>
				<CellButton
					subtitle="popout — транзиентный оверлей"
					onClick={() => void navigator.showPopout(logoutPopout)}
				>
					Выйти из аккаунта
				</CellButton>
			</Group>
			<Group>
				<Footer>URL и история браузера управляют панелями</Footer>
			</Group>
		</>
	);
}
