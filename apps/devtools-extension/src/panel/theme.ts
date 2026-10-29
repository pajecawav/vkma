import { useCallback, useEffect, useState } from "react";
import { api } from "../shared/api.ts";
import { applyTheme, readStoredTheme, THEME_KEY, writeStoredTheme } from "../shared/theme.ts";

/**
 * The extension's theme: chrome.storage.local is the single source of
 * truth (shared by the FAB iframe, the tab panel and the side panel —
 * their localStorage jars are third-party partitioned and would drift),
 * and storage.onChanged keeps every open surface in sync live. The
 * localStorage mirror is refreshed on apply so the pre-paint script in
 * index.html restores without a flash on the next load.
 */
export function useExtensionTheme(): { dark: boolean; toggle: () => void } {
	const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

	useEffect(() => {
		void readStoredTheme().then(pref => {
			if (pref !== undefined) {
				setDark(pref === "dark");
				applyTheme(pref === "dark");
			}
		});
		const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
			if (area === "local" && THEME_KEY in changes) {
				const value = changes[THEME_KEY]?.newValue;
				if (value === "dark" || value === "light") {
					setDark(value === "dark");
					applyTheme(value === "dark");
				}
			}
		};
		api.storage.onChanged.addListener(listener);
		return () => {
			api.storage.onChanged.removeListener(listener);
		};
	}, []);

	const toggle = useCallback(() => {
		// write-then-sync: own onChanged listener applies the new value —
		// one code path for local and remote changes
		void writeStoredTheme(!document.documentElement.classList.contains("dark"));
	}, []);

	return { dark, toggle };
}
