import { ModalPageSurface, useNavigator } from "@vkma.dev/router/preset";
import { usePanelParams } from "@vkma.dev/router/react";
import {
	CellButton,
	Footer,
	Group,
	ModalPageHeader,
	PanelHeaderClose,
	RichCell,
	Text,
} from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { postOf, users } from "../../data";
import { InitialsAvatar } from "../../ui";
import { postPanel } from "./feed.panel";

/** Route-modal chunk of the post panel, the comments page. */
export default function CommentsModal(): ReactElement {
	const navigator = useNavigator();
	const { id } = usePanelParams(postPanel);
	const post = postOf(id);

	return (
		<ModalPageSurface
			header={
				<ModalPageHeader
					before={<PanelHeaderClose onClick={() => navigator.hideModal()} />}
				>
					Комментарии · {post.comments.length}
				</ModalPageHeader>
			}
		>
			<Group>
				{post.comments.map(comment => {
					const commenter = users[comment.authorId]!;
					return (
						<RichCell
							key={comment.id}
							multiline
							before={<InitialsAvatar name={commenter.name} size={36} />}
							subtitle={comment.time}
						>
							{commenter.name}
							<Text
								style={{ marginTop: 4, color: "var(--vkui--color_text_secondary)" }}
							>
								{comment.text}
							</Text>
						</RichCell>
					);
				})}
				{post.comments.length === 0 && <Footer>Пока тихо</Footer>}
			</Group>
			<Group>
				<CellButton
					subtitle="replace-шаг цепочки: назад — сразу на панель"
					onClick={() =>
						void navigator.showModal({ to: "/post/$id/thread", params: { id } })
					}
				>
					Открыть тред
				</CellButton>
				<CellButton
					subtitle="child-роут: стекается поверх, back вернёт сюда"
					onClick={() =>
						void navigator.showModal({
							to: "/post/$id/comments/share",
							params: { id },
							props: { note: "Переслать в чат — открыто из комментариев" },
						})
					}
				>
					Поделиться (карточка поверх)
				</CellButton>
				<CellButton
					subtitle="вложенный child-роут — стекается поверх"
					onClick={() =>
						void navigator.showModal({
							to: "/post/$id/comments/report",
							params: { id },
						})
					}
				>
					Пожаловаться (вложенная карточка)
				</CellButton>
			</Group>
		</ModalPageSurface>
	);
}
