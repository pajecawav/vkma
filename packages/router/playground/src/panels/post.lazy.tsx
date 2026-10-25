import { useNavigator } from "@vkma.dev/router/preset";
import { usePanelParams, usePanelSearch } from "@vkma.dev/router/react";
import { Icon24CommentOutline, Icon24LikeOutline, Icon28UserCircleOutline } from "@vkontakte/icons";
import {
	Button,
	CellButton,
	Group,
	Header,
	PanelHeader,
	PanelHeaderBack,
	RichCell,
	SimpleCell,
	Tabs,
	TabsItem,
	Text,
} from "@vkontakte/vkui";
import type { ComponentType } from "react";
import { posts, users } from "../data";
import { app } from "../routes";
import { InitialsAvatar } from "../ui";

/**
 * The lazy panel chunk: split out of the main bundle, resolved on match
 * (the builder bridges these plain options into route.lazy()).
 */

export const postLazy = async (_routeId: string): Promise<{ component: ComponentType }> => ({
	component: PostPanel,
});

export interface PostSearch {
	tab?: "comments" | "likes";
}

function PostPanel() {
	const navigator = useNavigator();
	const { id = "1" } = usePanelParams(app.panels["feed/post/$id"]!.routeId);
	const search = usePanelSearch<PostSearch>(app.panels["feed/post/$id"]!.routeId);
	const post = posts.find(candidate => candidate.id === Number(id)) ?? posts[0]!;
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
					before={<InitialsAvatar name={author.name} color={author.color} size={44} />}
					subtitle={post.time}
				>
					{author.name}
				</RichCell>
				<div style={{ padding: "0 16px 4px" }}>
					<Text>{post.text}</Text>
				</div>
				{search?.tab === undefined && (
					<div style={{ display: "flex", gap: 4, padding: "8px 8px 0" }}>
						<Button
							size="s"
							mode={post.liked ? "secondary" : "tertiary"}
							before={<Icon24LikeOutline />}
							after={post.likes}
						>
							Нравится
						</Button>
						<Button
							size="s"
							mode="tertiary"
							before={<Icon24CommentOutline />}
							after={post.comments.length}
							onClick={() => setTab("comments")}
						>
							Комментарии
						</Button>
					</div>
				)}
			</Group>
			<Group>
				<Tabs>
					<TabsItem
						selected={search?.tab === undefined}
						onClick={() => setTab(undefined)}
					>
						Запись
					</TabsItem>
					<TabsItem
						selected={search?.tab === "comments"}
						onClick={() => setTab("comments")}
					>
						Комментарии
					</TabsItem>
					<TabsItem selected={search?.tab === "likes"} onClick={() => setTab("likes")}>
						Нравится
					</TabsItem>
				</Tabs>
			</Group>
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
								before={
									<InitialsAvatar
										name={commenter.name}
										color={commenter.color}
										size={36}
									/>
								}
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
						onClick={() =>
							void navigator.showModal({
								to: "/post/$id/comments",
								params: { id },
							})
						}
					>
						Все комментарии (модалка)
					</CellButton>
				</Group>
			) : search?.tab === "likes" ? (
				<Group header={<Header size="s">Нравится</Header>}>
					{Object.values(users).map(user => (
						<SimpleCell key={user.id} before={<Icon28UserCircleOutline />}>
							{user.name}
						</SimpleCell>
					))}
				</Group>
			) : null}
			<Group>
				<CellButton
					onClick={() =>
						void navigator.push({
							to: "/post/$id",
							params: { id: String(post.id + 1) },
						})
					}
				>
					Следующая запись → (та же панель, новый параметр)
				</CellButton>
				<CellButton onClick={() => navigator.backToFirst()}>
					На первый экран (backToFirst)
				</CellButton>
			</Group>
		</>
	);
}
