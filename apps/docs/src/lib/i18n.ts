// UI strings. Russian mirrors the strings the site shipped with Starlight.
export type Locale = "ru" | "en";

export const LOCALES: readonly Locale[] = ["ru", "en"];

const ru = {
	search: "Поиск",
	searchPh: "Поиск по документации",
	searchHint: "Поиск появится после сборки сайта",
	noResults: "Ничего не найдено",
	table: "Таблица",
	toc: "На этой странице",
	anchor: "Ссылка на раздел",
	edit: "Редактировать на GitHub",
	prev: "Назад",
	next: "Далее",
	menu: "Меню",
	close: "Закрыть",
	skip: "Перейти к содержимому",
	theme: "Переключить тему",
	copy: "Скопировать код",
	copied: "Скопировано",
	lang: "EN",
	langLabel: "English version",
	pm: "Пакетный менеджер",
	docs: "Документация",
	pagesNav: "Навигация по страницам",
	tagline: "Инструменты для VK Mini Apps",
	packages: "Пакеты",
	pages: "стр.",
	home: "Главная",
	breadcrumb: "Хлебные крошки",
	hintSel: "выбрать",
	hintOpen: "открыть",
	hintEsc: "закрыть",
};

export type Strings = typeof ru;

const en: Strings = {
	search: "Search",
	searchPh: "Search documentation",
	searchHint: "Search is available after a site build",
	noResults: "No results",
	table: "Table",
	toc: "On this page",
	anchor: "Link to section",
	edit: "Edit this page on GitHub",
	prev: "Previous",
	next: "Next",
	menu: "Menu",
	close: "Close",
	skip: "Skip to content",
	theme: "Toggle theme",
	copy: "Copy code",
	copied: "Copied",
	lang: "RU",
	langLabel: "Русская версия",
	pm: "Package manager",
	docs: "Documentation",
	pagesNav: "Page navigation",
	tagline: "Tooling for VK Mini Apps",
	packages: "Packages",
	pages: "pages",
	home: "Home",
	breadcrumb: "Breadcrumb",
	hintSel: "select",
	hintOpen: "open",
	hintEsc: "close",
};

const dict: Record<Locale, Strings> = { ru, en };

export const t = (locale: Locale): Strings => dict[locale] ?? dict.ru;
