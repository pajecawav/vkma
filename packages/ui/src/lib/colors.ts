/**
 * Panel-side view of the shared client palette: the djb2 hash lives in
 * `src/shared/colors.ts` (the FAB needs raw hex for its shadow DOM), here
 * indexes map to Tailwind classes. Keep the class lists in sync with the
 * shared palette's tone order.
 */
import { clientColorIndex } from "@vkma.dev/protocol";

interface ClientColor {
	/** Colored square in badges. */
	dot: string;
	/** Colored short-id text. */
	text: string;
}

const CLIENT_CLASSES: readonly ClientColor[] = [
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
	return CLIENT_CLASSES[clientColorIndex(clientId)] ?? CLIENT_CLASSES[0]!;
}
