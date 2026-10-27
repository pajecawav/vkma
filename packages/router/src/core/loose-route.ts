/**
 * Loosely-typed view of a registered route. `AnyRoute`'s options bag is
 * generic-erased (`any`), so every consumer of `router.routesById` needs
 * the same structural recast — this owns it once.
 */
export interface LooseRoute {
	options: { staticData?: { panel?: string; modal?: string } };
	fullPath?: string;
}

/** Read a route out of the router's registered tree without the cast noise. */
export function looseRouteOf(
	router: { routesById: unknown },
	routeId: string,
): LooseRoute | undefined {
	return (router.routesById as Record<string, LooseRoute>)[routeId];
}
