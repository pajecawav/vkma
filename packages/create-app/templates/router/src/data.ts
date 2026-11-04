export interface Post {
	id: number;
	author: string;
	text: string;
	comments: string[];
}

/** Demo content for the feed story — replace with your API calls. */
export const POSTS: Post[] = [
	{
		id: 1,
		author: "Команда VK",
		text: "Мини-приложения теперь скаффолдятся одной командой.",
		comments: ["Наконец-то!", "А роутер есть? — Есть."],
	},
	{
		id: 2,
		author: "Разработка",
		text: "Vite + VKUI + @vkma.dev/router — быстрый старт без конфигурации.",
		comments: ["Deep links работают из коробки."],
	},
	{
		id: 3,
		author: "Дизайн",
		text: "Соблюдайте паттерны навигации из гайда VKUI.",
		comments: [],
	},
];

export function postOf(id: string): Post {
	return POSTS.find(post => String(post.id) === id) ?? POSTS[0]!;
}
