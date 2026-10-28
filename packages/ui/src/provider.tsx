import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import { LucideProvider } from "lucide-react";
import type { ReactNode } from "react";

/**
 * House defaults for every @vkma.dev/ui surface: lucide icons draw at
 * 16px / stroke 1.75 — the weight the panel always drew its icons with
 * (lucide's own default is 24px / stroke 2, which visibly inflates every
 * icon-bearing button) — and tooltips share one delay profile, so hints
 * time identically everywhere. Wrap the app root in this; the ui icons
 * are plain re-exports that rely on the context.
 */
export function UiProvider({ children }: { children: ReactNode }) {
	return (
		<BaseTooltip.Provider delay={200} closeDelay={100}>
			<LucideProvider size={16} strokeWidth={1.75}>
				{children}
			</LucideProvider>
		</BaseTooltip.Provider>
	);
}
