import {
	ModalCardSurface,
	useModalProps,
	useNavigator,
	usePanelParams,
} from "@vkma.dev/router/preset";
import { Button, ButtonGroup, Footer } from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { postPanel } from "./feed.panel";

/**
 * A route-modal chunk: a masked child route of the post panel, split out
 * of the main bundle. Runtime props arrive through `useModalProps` —
 * typed by the handle's phantom (declared in feed.panel.ts), no manual
 * generics to keep in sync. onClose is the host's (`history.back()`).
 */
export default function SharePostCard(): ReactElement {
	const navigator = useNavigator();
	const { id } = usePanelParams(postPanel);
	const { note } = useModalProps(postPanel.modals.share) ?? {};

	return (
		<ModalCardSurface
			title={`Поделиться записью ${id}`}
			description={note ?? "Ссылка откроет именно эту запись"}
			actions={
				<ButtonGroup stretched gap="s" align="center">
					<Button size="l" mode="primary" stretched onClick={() => navigator.hideModal()}>
						Понятно
					</Button>
				</ButtonGroup>
			}
		>
			<Footer>модалка-маршрут: back закрывает, прямая ссылка открывает</Footer>
		</ModalCardSurface>
	);
}
