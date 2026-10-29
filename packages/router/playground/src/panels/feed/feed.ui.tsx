import { useNavigator } from "@vkma.dev/router/preset";
import { usePanelLoaderData } from "@vkma.dev/router/react";
import { Icon24CommentOutline, Icon24Like, Icon24LikeOutline } from "@vkontakte/icons";
import {
	Group,
	Header,
	IconButton,
	PanelHeader,
	Separator,
	SimpleCell,
	Text,
} from "@vkontakte/vkui";
import { useState } from "react";
import { users, type Post } from "../../data";
import { InitialsAvatar } from "../../ui";
import { feedPanel, postPanel } from "./feed.panel";

export default function FeedPanel() {
	const navigator = useNavigator();
	const data = usePanelLoaderData(feedPanel);

	return (
		<>
			<PanelHeader>Лента</PanelHeader>
			<Group header={<Header size="s">Свежее</Header>}>
				{(data?.posts ?? []).map((post, i) => (
					<div key={post.id}>
						{i > 0 && <Separator />}
						<PostCard
							post={post}
							onOpen={() => void navigator.push(postPanel, { id: String(post.id) })}
							onComments={() =>
								void navigator.push(
									postPanel,
									{ id: String(post.id) },
									{ search: { tab: "comments" } },
								)
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
	const [liked, setLiked] = useState(post.liked);
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
				<IconButton
					aria-label={
						liked ? "Убрать отметку «нравится»" : "Поставить отметку «нравится»"
					}
					onClick={() => setLiked(value => !value)}
				>
					{liked ? (
						<Icon24Like fill="var(--vkui--color_accent_red)" />
					) : (
						<Icon24LikeOutline />
					)}
				</IconButton>
				<IconButton aria-label="Комментарии" onClick={onComments}>
					<Icon24CommentOutline />
				</IconButton>
			</div>
		</div>
	);
}
