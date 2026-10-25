import { useNavigator } from "@vkma.dev/router/preset";
import { usePanelParams } from "@vkma.dev/router/react";
import {
	CellButton,
	Footer,
	Group,
	Header,
	ModalPageHeader,
	PanelHeaderClose,
	RichCell,
	SimpleCell,
	Text,
} from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { app } from "../app";
import { posts, users } from "../data";
import { InitialsAvatar } from "../ui";

/** Route modals of the post panel — lazy chunks next to the panel itself. */

export function CommentsModal(): ReactElement {
	const navigator = useNavigator();
	const { id } = usePanelParams(app.panels["feed/post/$id"]);
	const post = posts.find(candidate => candidate.id === Number(id)) ?? posts[0]!;

	return (
		<>
			<ModalPageHeader before={<PanelHeaderClose onClick={() => navigator.hideModal()} />}>
				Комментарии · {post.comments.length}
			</ModalPageHeader>
			<Group>
				{post.comments.map(comment => {
					const commenter = users[comment.authorId]!;
					return (
						<RichCell
							key={comment.id}
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
					subtitle="модалка на модалке: назад — сразу на панель"
					onClick={() =>
						void navigator.showModal({ to: "/post/$id/thread", params: { id } })
					}
				>
					Открыть тред
				</CellButton>
			</Group>
		</>
	);
}

export function ThreadModal(): ReactElement {
	const navigator = useNavigator();
	return (
		<>
			<ModalPageHeader before={<PanelHeaderClose onClick={() => navigator.hideModal()} />}>
				Тред
			</ModalPageHeader>
			<Group header={<Header size="s">Второй уровень</Header>}>
				<SimpleCell>
					Ветка ответов. Первая шторка закрылась со своей анимацией — и только потом
					открылась эта.
				</SimpleCell>
			</Group>
		</>
	);
}
