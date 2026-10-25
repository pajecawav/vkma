import { useNavigator } from "@vkma.dev/router/preset";
import { usePanelLoaderData } from "@vkma.dev/router/react";
import { Icon24CommentOutline, Icon24Like, Icon24LikeOutline } from "@vkontakte/icons";
import {
	Group,
	Header,
	IconButton,
	PanelHeader,
	PanelHeaderBack,
	Separator,
	SimpleCell,
	Text,
} from "@vkontakte/vkui";
import { users, type Post } from "../../data";
import { InitialsAvatar } from "../../ui";
import { feedPanel } from "./feed.panel";

export default function FeedPanel() {
	const navigator = useNavigator();
	const data = usePanelLoaderData(feedPanel);

	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				Лента
			</PanelHeader>
			<Group header={<Header size="s">Свежее</Header>}>
				{(data?.posts ?? []).map((post, i) => (
					<div key={post.id}>
						{i > 0 && <Separator />}
						<PostCard
							post={post}
							onOpen={() =>
								void navigator.push({
									to: "/post/$id",
									params: { id: String(post.id) },
								})
							}
							onComments={() =>
								void navigator.push({
									to: "/post/$id",
									params: { id: String(post.id) },
									search: { tab: "comments" },
								})
							}
						/>
					</div>
				))}
			</Group>
		</>
	);
}

function PostCard({
	post,
	onOpen,
	onComments,
}: {
	post: Post;
	onOpen: () => void;
	onComments: () => void;
}) {
	const author = users[post.authorId]!;
	return (
		<div style={{ padding: "4px 0 10px" }}>
			<SimpleCell
				before={<InitialsAvatar name={author.name} size={44} />}
				subtitle={post.time}
				onClick={onOpen}
			>
				{author.name}
			</SimpleCell>
			<div style={{ padding: "0 16px" }}>
				<Text>{post.text}</Text>
			</div>
			<div style={{ display: "flex", gap: 4, padding: "8px 8px 0" }}>
				<IconButton>
					{post.liked ? (
						<Icon24Like fill="var(--vkui--color_accent_red)" />
					) : (
						<Icon24LikeOutline />
					)}
				</IconButton>
				<IconButton onClick={onComments}>
					<Icon24CommentOutline />
				</IconButton>
			</div>
		</div>
	);
}
