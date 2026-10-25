import { useNavigator } from "@vkma.dev/router/preset";
import { usePanelParams } from "@vkma.dev/router/react";
import {
	Box,
	CellButton,
	Footnote,
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
				<CellButton
					subtitle="та же цепочка, но surface — ModalCard"
					onClick={() =>
						void navigator.showModal({ to: "/post/$id/share", params: { id } })
					}
				>
					Поделиться (карточка)
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

/**
 * Body of the `share` route modal — the HOST renders it inside a ModalCard
 * (kind: "card" in the app options); the card chrome (title/description/
 * actions) is declared statically next to the entry, this component is the
 * param-aware content.
 */
export function ShareCard(): ReactElement {
	const { id } = usePanelParams(app.panels["feed/post/$id"]);
	const post = posts.find(candidate => candidate.id === Number(id)) ?? posts[0]!;

	return (
		<Box padding="m" style={{ textAlign: "center" }}>
			<Text weight="2">«{post.text}»</Text>
			<Footnote style={{ marginTop: 8, color: "var(--vkui--color_text_secondary)" }}>
				параметры панели резолвятся и в{"\u00A0"}карточке · пост{"\u00A0"}
				{id}
			</Footnote>
		</Box>
	);
}
