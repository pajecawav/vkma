/** Fake content for the demo app, «Профиль / Лента / Сообщения / Ещё». */

export interface User {
	id: string;
	name: string;
	color: string;
}

export const users: Record<string, User> = {
	anna: { id: "anna", name: "Аня Смирнова", color: "#7292eb" },
	boris: { id: "boris", name: "Борис Кузнецов", color: "#67b0a6" },
	vera: { id: "vera", name: "Вера Лебедева", color: "#e28fb4" },
	gleb: { id: "gleb", name: "Глеб Морозов", color: "#dba95c" },
	dasha: { id: "dasha", name: "Даша Ким", color: "#9a8be0" },
};

export interface PostComment {
	id: number;
	authorId: string;
	text: string;
	time: string;
}

export interface Post {
	id: number;
	authorId: string;
	time: string;
	text: string;
	likes: number;
	liked: boolean;
	comments: PostComment[];
}

export const posts: Post[] = [
	{
		id: 1,
		authorId: "boris",
		time: "сегодня в 10:14",
		text: "Выкатили первую версию роутера для мини-приложений: панели со статичными детьми, модалки как маршруты и синк с хостом из коробки. Свайп-бек работает сам, глубокие ссылки раздуваются в натуральную цепочку.",
		likes: 148,
		liked: false,
		comments: [
			{
				id: 1,
				authorId: "vera",
				text: "Инфлейт — это магия, наконец-то back не закрывает приложение",
				time: "12 мин",
			},
			{ id: 2, authorId: "gleb", text: "А тайпд-серч пробрасывается?", time: "8 мин" },
			{ id: 3, authorId: "dasha", text: "Забрала в проект, спасибо!", time: "3 мин" },
		],
	},
	{
		id: 2,
		authorId: "vera",
		time: "вчера в 19:02",
		text: "Кофейня у метро открылась раньше на неделю. Флэт уайт — 10/10, десерты ещё не пробовала, но место уже любимое.",
		likes: 92,
		liked: true,
		comments: [
			{ id: 1, authorId: "anna", text: "Адрес скинь!", time: "40 мин" },
			{ id: 2, authorId: "boris", text: "Согласен, эспрессо топ", time: "1 ч" },
		],
	},
	{
		id: 3,
		authorId: "gleb",
		time: "вчера в 12:40",
		text: "Кто на пробежке в субботу? Собираемся в 11 у главного входа, потом завтрак. Список дорожки скину вечером.",
		likes: 27,
		liked: false,
		comments: [{ id: 1, authorId: "dasha", text: "Я за, +1", time: "2 ч" }],
	},
	{
		id: 4,
		authorId: "dasha",
		time: "2 дня назад",
		text: "Пересобрала стенд с VKUI-компонентами: модальные страницы с последовательной хореографией больше не конфликтуют, даже если открывать цепочкой. Подробности — в комментариях.",
		likes: 310,
		liked: false,
		comments: [
			{
				id: 1,
				authorId: "vera",
				text: "Наконец-то! Помнишь тот баг с двумя открытыми шторками?",
				time: "1 д",
			},
			{ id: 2, authorId: "anna", text: "Сохранила себе", time: "1 д" },
			{ id: 3, authorId: "boris", text: "Респект за анимации", time: "22 ч" },
		],
	},
	{
		id: 5,
		authorId: "anna",
		time: "3 дня назад",
		text: "Мелочь, а приятно: deep link вида #/post/3 открывает ленту так, будто пользователь сам по ней прошёл — назад идёт по натуральной цепочке панелей.",
		likes: 64,
		liked: false,
		comments: [],
	},
];

export interface ChatMessage {
	out: boolean;
	text: string;
	time: string;
}

export interface Chat {
	id: string;
	userId: string;
	lastMessage: string;
	time: string;
	unread: number;
	messages: ChatMessage[];
}

export const chats: Chat[] = [
	{
		id: "anna",
		userId: "anna",
		lastMessage: "Скинь ссылку на плейграунд, покручу",
		time: "10:32",
		unread: 2,
		messages: [
			{ out: false, text: "Привет! Видела твой роутер в деле?", time: "10:28" },
			{ out: true, text: "Ага, витрину собрал — лента, чаты, модалки", time: "10:30" },
			{ out: false, text: "Скинь ссылку на плейграунд, покручу", time: "10:32" },
		],
	},
	{
		id: "boris",
		userId: "boris",
		lastMessage: "Свайп-бек завёлся без единой строчки кода 👌",
		time: "09:58",
		unread: 0,
		messages: [
			{ out: true, text: "Что скажешь про синк с хостом?", time: "09:50" },
			{ out: false, text: "Свайп-бек завёлся без единой строчки кода 👌", time: "09:58" },
		],
	},
	{
		id: "vera",
		userId: "vera",
		lastMessage: "Кофейня в субботу?",
		time: "вчера",
		unread: 1,
		messages: [
			{ out: false, text: "Кофейня в субботу?", time: "вчера" },
			{ out: true, text: "Я за! Во сколько начнём?", time: "вчера" },
			{ out: false, text: "Давай в 12, столик закажу заранее", time: "вчера" },
		],
	},
	{
		id: "team",
		userId: "dasha",
		lastMessage: "Даша: стенд обновила, модалки не конфликтуют",
		time: "вчера",
		unread: 5,
		messages: [
			{ out: false, text: "Глеб: кто ревьюит PR?", time: "13:10" },
			{ out: false, text: "Даша: стенд обновила, модалки не конфликтуют", time: "13:24" },
		],
	},
	{
		id: "bot",
		userId: "gleb",
		lastMessage: "Ваш приз уже ждёт! Перейдите по ссылке…",
		time: "пн",
		unread: 0,
		messages: [{ out: false, text: "Ваш приз уже ждёт! Перейдите по ссылке…", time: "пн" }],
	},
];

export const chatTitleOf = (chat: Chat): string => users[chat.userId]?.name ?? "Чат";

/**
 * The post by id. The post panel's `beforeLoad` rejects unknown ids
 * (including warm param swaps), so every chunk under that panel can only
 * be matched with a valid one; this narrows the type and fails loudly if
 * the guard is ever removed.
 */
export function postOf(id: string): Post {
	const post = posts.find(candidate => candidate.id === Number(id));
	if (post === undefined) {
		throw new Error(
			`[playground] unknown post "${id}" — the panel guard should have caught it`,
		);
	}
	return post;
}
