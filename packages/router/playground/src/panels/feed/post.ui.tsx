import { useNavigator } from "@vkma.dev/router/preset";
import { usePanelParams, usePanelSearch } from "@vkma.dev/router/react";
import { Icon24CommentOutline, Icon24ShareOutline } from "@vkontakte/icons";
import {
	Button,
	CellButton,
	Group,
	Header,
	HorizontalScroll,
	PanelHeader,
	PanelHeaderBack,
	RichCell,
	SimpleCell,
	Tabs,
	TabsItem,
	Text,
} from "@vkontakte/vkui";
import type { ReactElement } from "react";
import { posts, users } from "../../data";
import { InitialsAvatar } from "../../ui";
import { postPanel, type PostSearch } from "./feed.panel";

/** The lazy panel chunk: split out of the main bundle, resolved on match. */
export default function PostPanel(): ReactElement {
	const navigator = useNavigator();
	const { id } = usePanelParams(postPanel);
	const search = usePanelSearch(postPanel);
	const post = posts.find(candidate => candidate.id === Number(id));
	if (post === undefined) {
		// beforeLoad rejects unknown ids (including warm param swaps) — this
		// branch only narrows the type
		throw new Error(`[playground] unknown post "${id}" — beforeLoad should have caught it`);
	}
	const author = users[post.authorId]!;
	const setTab = (tab: PostSearch["tab"]) => {
		void navigator.replace({ to: "/post/$id", params: { id }, search: { tab } });
	};

	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				Запись
			</PanelHeader>
			<Group>
				<RichCell
					before={<InitialsAvatar name={author.name} size={44} />}
					subtitle={post.time}
				>
					{author.name}
				</RichCell>
				<div style={{ padding: "0 16px 12px" }}>
					<Text>{post.text}</Text>
				</div>
			</Group>
			<Group>
				<HorizontalScroll>
					<Tabs withScrollToSelectedTab>
						<TabsItem
							selected={search?.tab === undefined}
							aria-controls="post-tab-content"
							onClick={() => setTab(undefined)}
						>
							Запись
						</TabsItem>
						<TabsItem
							selected={search?.tab === "comments"}
							aria-controls="post-tab-content"
							onClick={() => setTab("comments")}
						>
							Комментарии
						</TabsItem>
						<TabsItem
							selected={search?.tab === "likes"}
							aria-controls="post-tab-content"
							onClick={() => setTab("likes")}
						>
							Нравится
						</TabsItem>
					</Tabs>
				</HorizontalScroll>
			</Group>
			<div id="post-tab-content">
				{search?.tab === undefined && (
					<Group>
						<div style={{ display: "flex", gap: 4, padding: "10px 8px" }}>
							<Button
								size="s"
								mode={post.liked ? "secondary" : "tertiary"}
								after={post.likes}
							>
								Нравится
							</Button>
							<Button
								size="s"
								mode="tertiary"
								after={post.comments.length}
								onClick={() => setTab("comments")}
							>
								Комментарии
							</Button>
							<Button
								size="s"
								mode="tertiary"
								onClick={() =>
									void navigator.showModal({
										to: "/post/$id/share",
										params: { id },
										props: { note: "Выберите чат для пересылки" },
									})
								}
							>
								Поделиться
							</Button>
						</div>
					</Group>
				)}
				{search?.tab === "comments" ? (
					<Group
						header={<Header size="s">Комментарии</Header>}
						description="Типизированный ?tab=comments — содержимое панели меняет поиск"
					>
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
										style={{
											marginTop: 4,
											color: "var(--vkui--color_text_secondary)",
										}}
									>
										{comment.text}
									</Text>
								</RichCell>
							);
						})}
						<CellButton
							before={<Icon24CommentOutline />}
							subtitle="модалка поверх панели"
							onClick={() =>
								void navigator.showModal({
									to: "/post/$id/comments",
									params: { id },
								})
							}
						>
							Все комментарии
						</CellButton>
						<CellButton
							before={<Icon24ShareOutline />}
							subtitle="карточка с runtime-пропсами"
							onClick={() =>
								void navigator.showModal({
									to: "/post/$id/share",
									params: { id },
									props: { note: "Выберите чат для пересылки" },
								})
							}
						>
							Поделиться
						</CellButton>
					</Group>
				) : search?.tab === "likes" ? (
					<Group header={<Header size="s">Нравится</Header>}>
						{Object.values(users).map(user => (
							<SimpleCell
								key={user.id}
								before={<InitialsAvatar name={user.name} size={40} />}
							>
								{user.name}
							</SimpleCell>
						))}
					</Group>
				) : null}
			</div>
			<Group>
				<CellButton
					subtitle="та же панель, новый параметр"
					onClick={() =>
						void navigator.push({
							to: "/post/$id",
							params: { id: String(post.id + 1) },
						})
					}
				>
					Следующая запись
				</CellButton>
				<CellButton
					subtitle="backToFirst — схлопнуть весь стек"
					onClick={() => navigator.backToFirst()}
				>
					На первый экран
				</CellButton>
			</Group>
		</>
	);
}
