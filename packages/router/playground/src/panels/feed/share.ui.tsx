import { ModalCardSurface, useNavigator } from "@vkma.dev/router/preset";
import { useModalProps, usePanelParams } from "@vkma.dev/router/react";
import { Box, Button, ButtonGroup, Footnote, Text } from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { postOf } from "../../data";
import { postPanel } from "./feed.panel";

/**
 * Route-modal chunk of the post panel, the share ModalCard. The chrome is
 * runtime: the description comes from `showModal({ props })` (history
 * state) with a fallback, actions use the navigator.
 */
export default function ShareCard(): ReactElement {
	const { id } = usePanelParams(postPanel);
	const { note } = useModalProps<{ note?: string }>() ?? {};
	const navigator = useNavigator();
	const post = postOf(id);

	return (
		<ModalCardSurface
			title="Поделиться постом"
			description={note ?? "Публикация будет отправлена в выбранный чат"}
			actions={
				<ButtonGroup stretched gap="s">
					<Button size="l" stretched onClick={() => navigator.hideModal()}>
						Отправить
					</Button>
					<Button
						size="l"
						mode="secondary"
						stretched
						onClick={() => navigator.hideModal()}
					>
						Отмена
					</Button>
				</ButtonGroup>
			}
		>
			<Box padding="m" style={{ textAlign: "center" }}>
				<Text weight="2">«{post.text}»</Text>
				<Footnote style={{ marginTop: 8, color: "var(--vkui--color_text_secondary)" }}>
					параметры панели резолвятся и в карточке
				</Footnote>
			</Box>
		</ModalCardSurface>
	);
}
