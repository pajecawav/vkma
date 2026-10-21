/**
 * Deterministic, curated client colors: a hash of the clientId picks one of
 * eight muted tones that read on both light and dark surfaces. Same client
 * → same color everywhere (timeline badges, header badge), stable across
 * reloads and registry changes.
 */

interface ClientColor {
	/** Colored square in badges. */
	dot: string;
	/** Colored short-id text. */
	text: string;
}

const CLIENT_PALETTE: readonly ClientColor[] = [
	{ dot: "bg-rose-500", text: "text-rose-700 dark:text-rose-300" },
	{ dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-300" },
	{ dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-300" },
	{ dot: "bg-teal-500", text: "text-teal-700 dark:text-teal-300" },
	{ dot: "bg-sky-500", text: "text-sky-700 dark:text-sky-300" },
	{ dot: "bg-indigo-500", text: "text-indigo-700 dark:text-indigo-300" },
	{ dot: "bg-purple-500", text: "text-purple-700 dark:text-purple-300" },
	{ dot: "bg-pink-500", text: "text-pink-700 dark:text-pink-300" },
];

export function clientColor(clientId: string): ClientColor {
	let hash = 5381;
	for (let index = 0; index < clientId.length; index++) {
		hash = ((hash << 5) + hash + clientId.charCodeAt(index)) >>> 0;
	}
	return CLIENT_PALETTE[hash % CLIENT_PALETTE.length] ?? CLIENT_PALETTE[0]!;
}
