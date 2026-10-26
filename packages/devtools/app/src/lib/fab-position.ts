import {
	FAB_POSITION_STORAGE_KEY,
	normalizeFabPosition,
	type FabPosition,
} from "@vkma.dev/ui/fab-position";
import { useCallback, useState } from "react";

/**
 * The devtools FAB placement: localStorage of the dev server origin. The
 * panel (the FAB iframe or the standalone tab) is same-origin with the
 * mini app page, so a write here fires the storage event there and the
 * collector moves the in-page FAB live.
 */
export function useFabPosition(): { position: FabPosition; pick: (position: FabPosition) => void } {
	const [position, setPosition] = useState<FabPosition>(() => {
		try {
			return normalizeFabPosition(localStorage.getItem(FAB_POSITION_STORAGE_KEY));
		} catch {
			return "bottom-right";
		}
	});

	const pick = useCallback((next: FabPosition) => {
		setPosition(next);
		try {
			localStorage.setItem(FAB_POSITION_STORAGE_KEY, next);
		} catch {
			// storage denied — the FAB keeps its current placement
		}
	}, []);

	return { position, pick };
}
