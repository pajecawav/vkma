/**
 * Theme persistence for the extension panels. localStorage is NOT the
 * source of truth here: the FAB iframe's storage is third-party
 * partitioned (per top-level site!) and every surface would keep its own
 * jar — the theme would "not save". chrome.storage.local is shared by
 * all extension contexts; localStorage stays as a per-jar mirror so the
 * pre-paint script in index.html can restore without a flash.
 */
export const THEME_KEY = "vkma:theme";
export type ThemePref = "dark" | "light";

export function applyTheme(dark: boolean): void {
	document.documentElement.classList.toggle("dark", dark);
	try {
		localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
	} catch {
		// the mirror is best-effort only
	}
}

export function readStoredTheme(): Promise<ThemePref | undefined> {
	return chrome.storage.local.get(THEME_KEY).then(stored => {
		const value = stored[THEME_KEY];
		return value === "dark" || value === "light" ? value : undefined;
	});
}

export function writeStoredTheme(dark: boolean): Promise<void> {
	return chrome.storage.local.set({ [THEME_KEY]: dark ? "dark" : "light" });
}
