/**
 * FAB placement preference — pure data shared by the devtools panel and
 * the devtools-extension (the storage backends differ: localStorage on
 * the dev server origin vs chrome.storage.local in the extension, both
 * under the same key name).
 */
export const FAB_POSITIONS = ["bottom-right", "bottom", "bottom-left"] as const;
export type FabPosition = (typeof FAB_POSITIONS)[number];

export const FAB_POSITION_STORAGE_KEY = "vkma:fab-position";

export function normalizeFabPosition(value: unknown): FabPosition {
	return FAB_POSITIONS.includes(value as FabPosition) ? (value as FabPosition) : "bottom-right";
}
