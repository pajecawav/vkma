import { useNavigator } from "@vkma.dev/router/preset";
import { Footer, Group, Header, PanelHeader, PanelHeaderBack, SimpleCell } from "@vkontakte/vkui";
import type { ReactElement } from "react";

/**
 * The feature index: every row IS a deep link to the scenario it describes,
 * so the showcase dogfoods its own router (typed search, route modals,
 * inflate) as its own table of contents. The rows are the e2e script.
 */

interface Scenario {
	title: string;
	/** the mechanism + the canonical URL — the URL is the demo */
	subtitle: string;
	to: string;
	search?: Record<string, string>;
}

const SCENARIOS: Scenario[] = [
	{
		title: "Панели и табы",
		subtitle: "#/feed — replace-навигация по таббару",
		to: "/feed",
	},
	{
		title: "Лоадер и lazy-чанк",
		subtitle: "#/post/2 — чанк резолвится на матче, лоадер — ScreenSpinner",
		to: "/post/2",
	},
	{
		title: "Типизированный search",
		subtitle: "#/post/2?tab=comments — контент панели из поиска",
		to: "/post/2",
		search: { tab: "comments" },
	},
	{
		title: "Модалка-страница",
		subtitle: "#/post/2/comments — ModalPage как child-роут панели",
		to: "/post/2/comments",
	},
	{
		title: "Стек вложенных модалк",
		subtitle: "#/post/2/comments/share — карточка ПОВЕРХ шторки, back разматывает по одной",
		to: "/post/2/comments/share",
	},
	{
		title: "Цепочка модалк (replace)",
		subtitle: "#/post/2/thread — шаг цепочки, back сразу на панель",
		to: "/post/2/thread",
	},
	{
		title: "Глобальная модалка",
		subtitle: "?modal=settings — поверх любой панели",
		to: "/feed",
		search: { modal: "settings" },
	},
	{
		title: "Редирект из beforeLoad",
		subtitle: "#/chat/bot → /messages, след в typed search",
		to: "/chat/bot",
	},
	{
		title: "Инфлейт глубокой ссылки",
		subtitle: "холодный URL поднимает всю цепочку — back не закрывает приложение",
		to: "/chat/anna",
	},
	{
		title: "404",
		subtitle: "неизвестный URL — витрина NotFound, не тишина",
		to: "/nowhere",
	},
];

export default function AboutPanel(): ReactElement {
	const navigator = useNavigator();
	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				О приложении
			</PanelHeader>
			<Group header={<Header size="s">Витрина роутера — каждый пункт сам deep link</Header>}>
				{SCENARIOS.map(scenario => (
					<SimpleCell
						key={scenario.title}
						chevron="always"
						multiline
						subtitle={scenario.subtitle}
						onClick={() =>
							void navigator.push({
								to: scenario.to,
								...(scenario.search === undefined
									? {}
									: { search: scenario.search }),
							})
						}
					>
						{scenario.title}
					</SimpleCell>
				))}
			</Group>
			<Group>
				<Group mode="plain">
					<SimpleCell indicator="0.1.0">Версия</SimpleCell>
					<SimpleCell indicator="Русский">Язык приложения</SimpleCell>
				</Group>
				<Footer>
					@vkma.dev/router · витрина на TanStack Router. Панели, модалки-маршруты,
					попауты, инфлейт. Для бриджа и стека навигации откройте #/?debug=1.
				</Footer>
			</Group>
		</>
	);
}
