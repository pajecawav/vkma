// Locale + URL helpers. The root locale (ru) has no prefix, the mirror lives
// under /en/ — the contract `scripts/ai-endpoints.mjs` and the `.md` endpoints
// are built on.
import { SITE } from "../../sections.mjs";
import type { Locale } from "./i18n";

export { SITE };

export const DEFAULT_LOCALE: Locale = "ru";

export const localeOf = (id: string): Locale =>
	id === "en" || id.startsWith("en/") ? "en" : DEFAULT_LOCALE;

/** The id without its locale prefix: `en/bridge` → `bridge`, `en` → `index`. */
export const bareId = (id: string): string => {
	if (id === "en") {
		return "index";
	}
	return id.startsWith("en/") ? id.slice(3) : id;
};

/** The inverse of `bareId`. */
export const localize = (locale: Locale, bare: string): string =>
	locale === "en" ? (bare === "index" ? "en" : `en/${bare}`) : bare;

/** `index` → `/`, `bridge/tap` → `/bridge/tap/`, `en` → `/en/`. */
export const pathOf = (id: string): string => {
	const slug = id === "index" ? "" : id;
	return slug === "" ? "/" : `/${slug}/`;
};

export const urlOf = (id: string): string => SITE + pathOf(id);

/** The top-level directory a page belongs to: `bridge/tap` → `bridge`, the home page → ``. */
export const sectionOf = (bare: string): string => (bare === "index" ? "" : bare.split("/")[0]);
