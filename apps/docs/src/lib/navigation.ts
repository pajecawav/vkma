// The sidebar tree, its order and prev/next. `sections.mjs` is the single
// source of package order — the same file shapes llms.txt.
import { getCollection, type CollectionEntry } from "astro:content";
import { PACKAGES, START } from "../../sections.mjs";
import { bareId, localeOf, pathOf, sectionOf } from "./docs";
import type { Locale } from "./i18n";

export type Doc = CollectionEntry<"docs">;

export type NavItem =
	| { type: "link"; entry: Doc; label: string }
	| { type: "group"; dir: string; entries: Doc[] };

export const allDocs = (): Promise<Doc[]> => getCollection("docs");

/** 404 pages are routed by `src/pages/404.astro`, not by the rest route. */
export const isPage = (entry: Doc): boolean => bareId(entry.id) !== "404";

export const homeId = (locale: Locale): string => (locale === "en" ? "en" : "index");

export function navFor(entries: Doc[], locale: Locale): NavItem[] {
	const home = entries.find(entry => entry.id === homeId(locale));
	if (!home) {
		throw new Error(`docs: no home page for the "${locale}" locale`);
	}
	const pages = entries.filter(
		entry => entry !== home && isPage(entry) && localeOf(entry.id) === locale,
	);
	const sorted = (dir: string): Doc[] =>
		pages
			.filter(entry => sectionOf(bareId(entry.id)) === dir)
			.toSorted(
				(a, b) => a.data.sidebar.order - b.data.sidebar.order || a.id.localeCompare(b.id),
			);
	return [
		{
			type: "link",
			entry: home,
			label: locale === "en" ? (START.translations?.en ?? START.label) : START.label,
		},
		...PACKAGES.map(dir => ({ type: "group" as const, dir, entries: sorted(dir) })),
	];
}

/** The page's neighbours inside its own sidebar group. */
export function neighbours(nav: NavItem[], entry: Doc): { prev: Doc | null; next: Doc | null } {
	const group = nav.find(
		item => item.type === "group" && item.dir === sectionOf(bareId(entry.id)),
	);
	if (!group || group.type !== "group") {
		return { prev: null, next: null };
	}
	const index = group.entries.indexOf(entry);
	return { prev: group.entries[index - 1] ?? null, next: group.entries[index + 1] ?? null };
}

/** The sidebar's short name, else the title. */
export const navLabel = (entry: Doc): string => entry.data.sidebar.label || entry.data.title;

export const entryPath = (entry: Doc): string => pathOf(entry.id);

export const editUrl = (entry: Doc): string =>
	`https://github.com/pajecawav/vkma/edit/master/apps/docs/${entry.filePath}`;

export interface QuickLink {
	href: string;
	title: string;
	section: string;
}

/** The start page and every package index — the search dialog's opening list. */
export function quickLinks(nav: NavItem[]): QuickLink[] {
	return nav.flatMap(item => {
		const entry = item.type === "link" ? item.entry : item.entries[0];
		return entry
			? [
					{
						href: entryPath(entry),
						title: entry.data.title,
						section: item.type === "link" ? "vkma.dev" : item.dir,
					},
				]
			: [];
	});
}

/** The same page in the other locale, if it exists. */
export const translation = (entries: Doc[], entry: Doc): Doc | null =>
	entries.find(other => other !== entry && bareId(other.id) === bareId(entry.id)) ?? null;
