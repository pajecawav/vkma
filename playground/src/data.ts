export interface Person {
	id: string;
	name: string;
	role: string;
}

export const PEOPLE: Record<string, Person> = {
	anna: { id: "anna", name: "Аня Смирнова", role: "Продукт" },
	boris: { id: "boris", name: "Борис Кузнецов", role: "Разработка" },
	vera: { id: "vera", name: "Вера Лебедева", role: "Дизайн" },
	gleb: { id: "gleb", name: "Глеб Морозов", role: "Исследования" },
	dasha: { id: "dasha", name: "Даша Ким", role: "Разработка" },
};

export interface Meeting {
	id: string;
	title: string;
	description: string;
	day: string;
	time: string;
	place: string;
	organizerId: string;
	attendeeIds: string[];
}

export type MeetingInput = Pick<Meeting, "title" | "description" | "day" | "time" | "place">;

export const INITIAL_MEETINGS: Meeting[] = [
	{
		id: "navigation",
		title: "Ревью мобильной навигации",
		description:
			"Пройдём холодные deep links, возврат по истории и жесты на iOS. Зафиксируем сценарии перед релизом.",
		day: "Сегодня",
		time: "15:00–15:45",
		place: "Переговорная «Север»",
		organizerId: "anna",
		attendeeIds: ["anna", "boris", "vera", "dasha"],
	},
	{
		id: "release",
		title: "Планирование релиза",
		description:
			"Соберём изменения bridge и devtools, проверим чеклист и назначим ответственных.",
		day: "Завтра",
		time: "11:30–12:15",
		place: "Видеозвонок",
		organizerId: "boris",
		attendeeIds: ["boris", "dasha"],
	},
	{
		id: "coffee",
		title: "Прогулка и кофе",
		description: "Небольшая неформальная встреча после недели релизов. Можно приходить позже.",
		day: "Суббота",
		time: "12:00–13:00",
		place: "Кофейня у парка",
		organizerId: "vera",
		attendeeIds: ["vera", "anna", "gleb"],
	},
	{
		id: "retro",
		title: "Ретро команды",
		description: "Что оставляем, что чиним и какие эксперименты больше не повторяем.",
		day: "Понедельник",
		time: "16:00–17:00",
		place: "Комната 4.2",
		organizerId: "dasha",
		attendeeIds: ["dasha", "boris", "anna", "vera", "gleb"],
	},
];

export type InvitationStatus = "pending" | "accepted" | "declined";

export interface Invitation {
	id: string;
	title: string;
	fromId: string;
	day: string;
	time: string;
	place: string;
	note: string;
	status: InvitationStatus;
}

export const INITIAL_INVITATIONS: Invitation[] = [
	{
		id: "run",
		title: "Субботняя пробежка",
		fromId: "gleb",
		day: "Суббота",
		time: "10:30",
		place: "Главный вход в парк",
		note: "Спокойный темп, потом завтрак. Дай знать до вечера пятницы.",
		status: "pending",
	},
	{
		id: "lecture",
		title: "Открытый лекторий по интерфейсам",
		fromId: "vera",
		day: "Вторник",
		time: "18:00",
		place: "Аудитория 3",
		note: "Будет разбор навигации в мини-приложениях и время для вопросов.",
		status: "pending",
	},
	{
		id: "expired",
		title: "Прошедшая встреча",
		fromId: "boris",
		day: "Вчера",
		time: "12:00",
		place: "—",
		note: "Это приглашение больше не принимает ответы.",
		status: "declined",
	},
];

export function personOf(id: string): Person {
	if (id === "me") {
		return { id, name: "Вы", role: "Организатор" };
	}
	return PEOPLE[id] ?? { id, name: "Неизвестный участник", role: "Гость" };
}
