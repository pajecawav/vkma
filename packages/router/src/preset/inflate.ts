/**
 * Inflate: a synthetic parent chain after a deep link. Deep-linked to the
 * 4th panel? Back should walk the natural flow (panel 1 → 2 → 3 → 4)
 * instead of closing the app. The chain is auto-derived from the view's
 * panel declaration order (declaration order IS the navigation flow — the
 * same convention VKUI animations rely on), replacing the old router's
 * manual `hierarchy` config.
 */

import type { PanelHandle } from "../preset/builders.tsx";

/**
 * Build the chain of hrefs to replay BEFORE the target location.
 *
 * @param orderedPanels panels of the target's view, in declaration order
 * @param targetRouteId route id of the deep-linked panel
 * @param params params of the deep-linked location (fill intermediate
 *              panels' path params; a panel whose params cannot be filled
 *              is skipped from the chain)
 * @returns hrefs excluding the target (the target is already the current
 *          history entry — replay replaces the first chain entry, pushes
 *          the rest, then re-pushes the target href)
 */
export function deriveInflateChain(
	orderedPanels: PanelHandle[],
	targetRouteId: string,
	params: Record<string, string>,
): string[] {
	const targetIndex = orderedPanels.findIndex(panel => panel.routeId === targetRouteId);
	if (targetIndex <= 0) {
		return []; // first panel of the view (or unknown) — nothing to inflate
	}
	const chain: string[] = [];
	for (const panel of orderedPanels.slice(0, targetIndex)) {
		// TanStack path params are `$name`
		const interpolated = panel.path.replace(/\$([A-Za-z0-9_]+)/g, (segment, key: string) => {
			const value = params[key];
			return value !== undefined ? value : segment;
		});
		if (interpolated.includes("$")) {
			continue; // a required param cannot be derived — skip the step
		}
		chain.push(interpolated.startsWith("/") ? interpolated : `/${interpolated}`);
	}
	return chain;
}
