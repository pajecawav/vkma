import { parseIgnoredSettings, type IgnoredEventsSettings } from "@vkma.dev/ui";
import { useCallback, useState } from "react";

const KEY = "vkma:ignored-events";

/**
 * The inspector panel's ignored-events storage: localStorage on the
 * panel's own origin (the inspector is self-hosted; the store and the
 * view share one process, so no messaging layer sits in between).
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
			// Storage disabled (private mode): session-only settings.
		}
	}, []);
	return { settings, save };
}
