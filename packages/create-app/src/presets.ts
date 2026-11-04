export interface Preset {
	readonly id: string;
	readonly title: string;
	readonly description: string;
	/** Overlay directory under templates/ layered on top of base; null = base only. */
	readonly overlay: string | null;
}

/**
 * The preset registry — data, not code. Every preset builds on the base
 * template (Vite + React + @vkma.dev bridge, devtools and deploy); an overlay
 * adds dependencies (its package.json fragment) and overrides source files.
 */
export const PRESETS: readonly Preset[] = [
	{
		id: "base",
		title: "Base",
		description: "React + Vite + @vkma.dev/bridge, devtools and deploy — no UI kit",
		overlay: null,
	},
	{
		id: "vkui",
		title: "VKUI",
		description: "Base + VKUI 8 — Epic/Tabbar navigation on local state",
		overlay: "vkui",
	},
	{
		id: "router",
		title: "Router + VKUI",
		description: "Base + @vkma.dev/router + VKUI — URL-driven views, panels, modals, popouts",
		overlay: "router",
	},
];

export const DEFAULT_PRESET_ID = "router";

export function getPreset(id: string): Preset | undefined {
	return PRESETS.find(preset => preset.id === id);
}
