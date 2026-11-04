import {
	Group,
	Header,
	Panel,
	PanelHeader,
	PanelHeaderBack,
	RichCell,
	View,
} from "@vkontakte/vkui";
import { useState } from "react";

interface Post {
	id: number;
	author: string;
	text: string;
}

const POSTS: Post[] = [
	{ id: 1, author: "Команда VK", text: "Мини-приложения теперь скаффолдятся одной командой." },
	{ id: 2, author: "Разработка", text: "Vite + VKUI — быстрый старт без конфигурации." },
	{ id: 3, author: "Дизайн", text: "Соблюдайте паттерны навигации из гайда VKUI." },
];

/** The feed story: a list screen and a detail screen with back navigation. */
export function FeedView({ id }: { id: string }) {
	const [activePanel, setActivePanel] = useState("feed");
	const [post, setPost] = useState<Post>(POSTS[0]!);

	return (
		<View id={id} activePanel={activePanel}>
			<Panel id="feed">
				<PanelHeader>Лента</PanelHeader>
				<Group header={<Header size="s">Записи</Header>}>
					{POSTS.map(item => (
						<RichCell key={item.id} onClick={() => setPost(item)}>
							{item.author}
						</RichCell>
					))}
				</Group>
			</Panel>
			<Panel id="post">
				<PanelHeader before={<PanelHeaderBack onClick={() => setActivePanel("feed")} />}>
					Запись
				</PanelHeader>
				<Group>
					<RichCell subtitle={post.author}>{post.text}</RichCell>
				</Group>
			</Panel>
		</View>
	);
}
