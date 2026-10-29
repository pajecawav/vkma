import { ModalPageSurface, useNavigator } from "@vkma.dev/router/preset";
import {
	Alert,
	Group,
	ModalPageHeader,
	PanelHeaderClose,
	SimpleCell,
	Switch,
	Footer,
} from "@vkontakte/vkui";

/**
 * Overlay components that are app-handle-free (no panel params): the
 * global settings modal and the logout popout. Panel-scoped route modals
 * live next to their panels (see panels/post-modals.tsx).
 */

export function SettingsGlobalModal() {
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
				<SimpleCell Component="label" after={<Switch defaultChecked />}>
					Звуки
				</SimpleCell>
			</Group>
			<Group>
				<Footer>
					глобальная модалка ?modal=settings — открыта с любой панели, URL замаскирован
				</Footer>
			</Group>
		</ModalPageSurface>
	);
}

export function LogoutPopout({ onClose }: { onClose: () => void }) {
	return (
		<Alert
			title="Выйти из аккаунта?"
			description="Черновики останутся на устройстве."
			actions={[
				{ title: "Отмена", mode: "cancel", action: onClose },
				{ title: "Выйти", mode: "destructive", action: onClose },
			]}
			onClose={onClose}
			onClosed={onClose}
		/>
	);
}
