import { ModalCardSurface, useNavigator } from "@vkma.dev/router/preset";
import { usePanelParams } from "@vkma.dev/router/react";
import { Box, Button, ButtonGroup, Footnote, Text } from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { postPanel } from "./feed.panel";

/**
 * NESTED route modal: a child route of the comments modal — it stacks ON
 * TOP of the open comments page (both sheets are visible), and back
 * unwinds just this level, revealing the comments again.
 */
export default function ReportModal(): ReactElement {
	const { id } = usePanelParams(postPanel);
	const navigator = useNavigator();

	return (
		<ModalCardSurface
			title="Жалоба на комментарий"
			description="Выберите причину — комментарий уйдёт модератору."
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
				<Text weight="2">Комментарий к посту #{id}</Text>
				<Footnote style={{ marginTop: 8, color: "var(--vkui--color_text_secondary)" }}>
					родительская модалка осталась открыта под этой карточкой
				</Footnote>
			</Box>
		</ModalCardSurface>
	);
}
