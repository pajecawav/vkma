/**
 * Deterministic, curated client colors: a djb2 hash of the clientId picks
 * one of eight muted 500-tones that read on both light and dark surfaces.
 * Same client → same color on every surface (timeline badges, header
 * badge, FAB glyph), stable across reloads and registry changes. The hex
 * values here are the wire format for non-Tailwind surfaces (the FAB's
 * shadow DOM); the panel maps indexes to its own classes.
 */
export const CLIENT_PALETTE: readonly string[] = [
	"#f43f5e", // rose-500
	"#f59e0b", // amber-500
	"#10b981", // emerald-500
	"#14b8a6", // teal-500
	"#0ea5e9", // sky-500
	"#6366f1", // indigo-500
	"#a855f7", // purple-500
	"#ec4899", // pink-500
];

export function clientColorIndex(clientId: string): number {
	let hash = 5381;
	for (let index = 0; index < clientId.length; index++) {
		hash = ((hash << 5) + hash + clientId.charCodeAt(index)) >>> 0;
	}
	return hash % CLIENT_PALETTE.length;
}
