/**
 * FAB placement on the host page — a global extension preference shared
 * by every surface (chrome.storage.local), applied live by the host
 * script via chrome.storage.onChanged.
 */
export const FAB_POSITIONS = ["bottom-right", "bottom", "bottom-left"] as const;
export type FabPosition = (typeof FAB_POSITIONS)[number];

export const FAB_POSITION_KEY = "vkma:fab-position";

export function normalizeFabPosition(value: unknown): FabPosition {
	return FAB_POSITIONS.includes(value as FabPosition) ? (value as FabPosition) : "bottom-right";
}
