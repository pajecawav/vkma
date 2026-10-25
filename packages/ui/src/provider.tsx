import { LucideProvider } from "lucide-react";
import type { ReactNode } from "react";

/**
 * House lucide defaults for every @vkma.dev/ui surface: 16px icons, stroke
 * 1.75 — the weight the panel always drew its icons with (lucide's own
 * default is 24px / stroke 2, which visibly inflates every icon-bearing
 * button). Wrap the app root in this; the ui icons are plain re-exports
 * that rely on the context.
 */
export function UiProvider({ children }: { children: ReactNode }) {
	return (
		<LucideProvider size={16} strokeWidth={1.75}>
			{children}
		</LucideProvider>
	);
}
