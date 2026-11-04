import { parseIgnoredSettings, type IgnoredEventsSettings } from "@vkma.dev/ui";
import { useCallback, useEffect, useState } from "react";
import { api } from "../shared/api.ts";

const KEY = "ignoredEvents";

const DEFAULTS = parseIgnoredSettings(null);

/**
 * The extension panel's ignored-events storage: `chrome.storage.local`,
 * shared by all three panel surfaces (side panel, FAB iframe, ?view=all).
 * `storage.onChanged` fans every save out to the other surfaces live, so
 * the same list, toggled in one panel, hides rows in all of them.
 */
export function useIgnoredEventsSettings() {
	const [settings, setSettings] = useState<IgnoredEventsSettings>(DEFAULTS);
	const save = useCallback((next: IgnoredEventsSettings) => {
		// State first: the write is fire-and-forget, and onChanged echoes
		// it back to this surface too, a double set with the same value.
		setSettings(next);
		void api.storage.local.set({ [KEY]: next });
	}, []);

	useEffect(() => {
		let alive = true;
		void api.storage.local.get(KEY).then(storage => {
			if (alive) {
				setSettings(parseIgnoredSettings(storage[KEY]));
			}
		});
		const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
			if (area === "local" && changes[KEY] !== undefined) {
				setSettings(parseIgnoredSettings(changes[KEY].newValue));
			}
		};
		api.storage.onChanged.addListener(listener);
		return () => {
			alive = false;
			api.storage.onChanged.removeListener(listener);
		};
	}, []);

	return { settings, save };
}
