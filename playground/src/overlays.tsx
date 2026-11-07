import { ModalPageSurface, useNavigator } from "@vkma.dev/router/preset";
import { Alert, ModalPageHeader, PanelHeaderClose } from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { SettingsControls } from "./panels/profile/settings-controls";
import { resetPlanner } from "./store";

const noop = (): void => undefined;

/** Global ?modal=settings route modal with the same live settings as the panel. */
export function SettingsModal(): ReactElement {
	const navigator = useNavigator();

	return (
		<ModalPageSurface
			hideCloseButton
			header={
				<ModalPageHeader
					before={<PanelHeaderClose onClick={() => navigator.hideModal()} />}
				>
					Настройки
				</ModalPageHeader>
			}
		>
			<SettingsControls />
		</ModalPageSurface>
	);
}

/** App-wide confirmation for restoring the planner fixtures. */
export function ResetPopout({ onClose }: { onClose: () => void }): ReactElement {
	return (
		<Alert
			title="Сбросить данные планировщика?"
			description="Встречи и приглашения вернутся к исходному списку. Настройки и профиль VK не изменятся."
			actionsLayout="horizontal"
			dismissLabel="Отмена"
			actions={[
				{ title: "Отмена", mode: "cancel" },
				{
					title: "Сбросить",
					mode: "destructive",
					// VKUI otherwise runs the action only after the exit animation, while
					// the router popout is already unmounted by onClose.
					autoCloseDisabled: true,
					action: ({ close } = {}) => {
						resetPlanner();
						close?.();
					},
				},
			]}
			onClose={onClose}
			onClosed={noop}
		/>
	);
}
