import { useNavigator } from "@vkma.dev/router/preset";
import { ModalCardSurface, ModalPageSurface } from "@vkma.dev/router/preset";
import { useModalProps, usePanelParams } from "@vkma.dev/router/react";
import {
	Box,
	Button,
	ButtonGroup,
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
import { posts, users } from "../../data";
import { InitialsAvatar } from "../../ui";
import { postPanel } from "./feed.panel";

/** Route modals of the post panel — lazy chunks next to the panel itself.
 * Each component renders its own surface (page or card) and owns every
 * prop at runtime; the host only binds the open/close choreography. */

export function CommentsModal(): ReactElement {
	const navigator = useNavigator();
	const { id } = usePanelParams(postPanel);
	const post = posts.find(candidate => candidate.id === Number(id)) ?? posts[0]!;

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
					subtitle="та же цепочка, но surface — ModalCard, с пропсами из showModal"
					onClick={() =>
						void navigator.showModal({
							to: "/post/$id/share",
							params: { id },
							props: { note: "Переслать в чат — открыто из комментариев" },
						})
					}
				>
					Поделиться (карточка)
				</CellButton>
			</Group>
		</ModalPageSurface>
	);
}

export function ThreadModal(): ReactElement {
	const navigator = useNavigator();
	return (
		<ModalPageSurface
			header={
				<ModalPageHeader
					before={<PanelHeaderClose onClick={() => navigator.hideModal()} />}
				>
					Тред
				</ModalPageHeader>
			}
		>
			<Group header={<Header size="s">Второй уровень</Header>}>
				<SimpleCell>
					Ветка ответов. Первая шторка закрылась со своей анимацией — и только потом
					открылась эта.
				</SimpleCell>
			</Group>
		</ModalPageSurface>
	);
}

/**
 * Body of the `share` route modal — a ModalCard surface. The chrome is
 * runtime: the description comes from `showModal({ props })` (history
 * state) with a fallback, actions use the navigator.
 */
export function ShareCard(): ReactElement {
	const { id } = usePanelParams(postPanel);
	const { note } = useModalProps<{ note?: string }>() ?? {};
	const navigator = useNavigator();
	const post = posts.find(candidate => candidate.id === Number(id)) ?? posts[0]!;

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
					параметры панели резолвятся и в{"\u00A0"}карточке · пост{"\u00A0"}
					{id}
				</Footnote>
			</Box>
		</ModalCardSurface>
	);
}
