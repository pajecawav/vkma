import { parseIgnoredSettings, type IgnoredEventsSettings } from "@vkma.dev/ui";
import { useCallback, useState } from "react";

const KEY = "vkma:ignored-events";

/**
 * The dev-server panel's ignored-events storage: localStorage on the dev
 * server origin, so the settings survive reloads per project. Writes are
 * synchronous and immutable-shared with the Timeline (the next render
 * reads the same object from state).
 */
export function useIgnoredEventsSettings() {
	const [settings, setSettings] = useState<IgnoredEventsSettings>(() =>
		parseIgnoredSettings(localStorage.getItem(KEY)),
	);
	const save = useCallback((next: IgnoredEventsSettings) => {
		setSettings(next);
		try {
			localStorage.setItem(KEY, JSON.stringify(next));
		} catch {
			// Private mode with storage disabled: the settings stay
			// session-only instead of killing the change.
		}
	}, []);
	return { settings, save };
}
