import { useNavigator } from "@vkma.dev/router/preset";
import { usePanelLoaderData } from "@vkma.dev/router/react";
import { Icon24CommentOutline, Icon24LikeOutline } from "@vkontakte/icons";
import {
	Button,
	Group,
	Header,
	PanelHeader,
	PanelHeaderBack,
	RichCell,
	ScreenSpinner,
	Separator,
	Text,
} from "@vkontakte/vkui";
import { users, type Post } from "../data";
import { app } from "../routes";
import { InitialsAvatar } from "../ui";

/** Loader data shape of the feed index panel. */
export interface FeedLoaderData {
	posts: Post[];
}

export function FeedPanel() {
	const navigator = useNavigator();
	const data = usePanelLoaderData<FeedLoaderData>(app.panels["feed/feed"]!.routeId);

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
			<RichCell
				before={<InitialsAvatar name={author.name} color={author.color} size={44} />}
				subtitle={post.time}
				onClick={onOpen}
			>
				{author.name}
			</RichCell>
			<div style={{ padding: "0 16px" }}>
				<Text>{post.text}</Text>
			</div>
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
					onClick={onComments}
				>
					Комментарии
				</Button>
			</div>
		</div>
	);
}

export function FeedPending() {
	return (
		<div style={{ height: "100vh" }}>
			<ScreenSpinner />
		</div>
	);
}
