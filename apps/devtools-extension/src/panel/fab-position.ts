import {
	FAB_POSITION_STORAGE_KEY,
	normalizeFabPosition,
	type FabPosition,
} from "@vkma.dev/ui/fab-position";
import { useCallback, useEffect, useState } from "react";

/**
 * The extension's FAB placement: chrome.storage.local is shared by every
 * surface (FAB iframe, tab panel, side panel) and storage.onChanged is
 * what moves the in-page FAB live — the host script listens for the same
 * changes.
 */
export function useFabPosition(): { position: FabPosition; pick: (position: FabPosition) => void } {
	const [position, setPosition] = useState<FabPosition>("bottom-right");

	useEffect(() => {
		void chrome.storage.local.get(FAB_POSITION_STORAGE_KEY).then(stored => {
			setPosition(normalizeFabPosition(stored[FAB_POSITION_STORAGE_KEY]));
		});
		const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
			if (area === "local" && FAB_POSITION_STORAGE_KEY in changes) {
				setPosition(normalizeFabPosition(changes[FAB_POSITION_STORAGE_KEY]?.newValue));
			}
		};
		chrome.storage.onChanged.addListener(listener);
		return () => {
			chrome.storage.onChanged.removeListener(listener);
		};
	}, []);

	const pick = useCallback((next: FabPosition) => {
		setPosition(next);
		void chrome.storage.local.set({ [FAB_POSITION_STORAGE_KEY]: next });
	}, []);

	return { position, pick };
}
