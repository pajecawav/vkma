import { ModalPageSurface, useNavigator } from "@vkma.dev/router/preset";
import {
	Alert,
	Footer,
	Group,
	ModalPageHeader,
	PanelHeaderClose,
	SimpleCell,
	Switch,
} from "@vkontakte/vkui";

/**
 * App-wide overlays: the global settings modal (openable from any panel —
 * the URL stays masked) and the logout popout (a transient overlay).
 */
export function SettingsModal() {
	const navigator = useNavigator();
	return (
		<ModalPageSurface
			header={
				<ModalPageHeader
					before={<PanelHeaderClose onClick={() => navigator.hideModal()} />}
				>
					Настройки
				</ModalPageHeader>
			}
		>
			<Group>
				<SimpleCell Component="label" after={<Switch defaultChecked />}>
					Push-уведомления
				</SimpleCell>
				<SimpleCell Component="label" after={<Switch />}>
					Тёмная тема (системная)
				</SimpleCell>
			</Group>
			<Group>
				<Footer>глобальная модалка — открыта с любой панели, URL замаскирован</Footer>
			</Group>
		</ModalPageSurface>
	);
}

export function LogoutPopout({ onClose }: { onClose: () => void }) {
	return (
		<Alert
			title="Выйти из аккаунта?"
			actions={[
				{ title: "Отмена", mode: "cancel", action: onClose },
				{ title: "Выйти", mode: "destructive", action: onClose },
			]}
			onClose={onClose}
			onClosed={onClose}
		/>
	);
}
