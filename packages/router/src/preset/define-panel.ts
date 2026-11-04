import type {
	LoaderDataOf,
	PanelOptions,
	PanelLazy,
	PanelRouteId,
	ParamsOfKey,
	SearchOf,
} from "./builders.ts";

/** Brand distinguishing a {@link PanelDefinition} from raw inline options. */
export const PANEL_DEFINITION = "__vkmaPanel" as const;

/**
 * A self-contained panel declaration: the definition IS the typed handle.
 *
 * Panel chunk modules import the DEFINITION (never the app) for their data
 * hooks. The definition's stored type is CLOSED (its `options` are widened
 * and the concrete option-derived types travel in the `types` phantom), so
 * the type graph stays acyclic and the app import disappears from chunks
 * entirely. `createApp` nests definitions under their view key and builds
 * the routes from `options`.
 */
export interface PanelDefinition<
	V extends string = string,
	P extends string = string,
	O extends PanelOptions = PanelOptions,
> {
	readonly [PANEL_DEFINITION]: true;
	/** The view (story) namespace: must match the key under `views`. */
	readonly view: V;
	/** The panel path segment (`"index"` = the view's home panel). */
	readonly path: P;
	/**
	 * The declared options, WIDENED on purpose: a widened stored type cannot
	 * reference chunk modules, so importing the definition from a chunk can
	 * never close a type cycle. The concrete option-derived data types
	 * travel in the phantom below.
	 */
	readonly options: PanelOptions;
	/** Runtime route id by convention (`/view:${view}/${path}`). */
	readonly routeId: PanelRouteId<V, P>;
	/**
	 * Phantom carrying the option-derived data types for the /react hooks.
	 * `O` is the options WITHOUT `lazy` (the loader is a separate factory
	 * parameter). Its arrow would otherwise embed the chunk module's
	 * (deferred) member types into the definition, the exact cycle this
	 * module exists to break.
	 */
	readonly types?: {
		params: ParamsOfKey<P>;
		search: SearchOf<O>;
		loaderData: LoaderDataOf<O>;
	};
}

/**
 * Declare a panel:
 *
 * ```ts
 * export const feedPanel = definePanel("feed", "feed", {
 * 	loader: async () => ({ posts }),
 * }, () => import("./feed"));
 * ```
 *
 * The returned definition nests directly into `createApp`'s
 * `views[view].panels[path]` and doubles as the typed handle for the
 * `/react` hooks. Chunk modules import it instead of the app handle, which
 * is what keeps the app's inference and the chunk graph acyclic. The view
 * key MUST match the nesting key in `createApp` (a mismatch is a dev-time
 * console error, not a silent hook break).
 */
export function definePanel<
	const V extends string,
	const P extends string,
	O extends PanelOptions = PanelOptions,
>(
	view: V,
	path: P,
	options: O,
	/**
	 * The lazy loader as a SEPARATE parameter, not a member of `options`.
	 * Its arrow references the UI chunk's module, whose member types include
	 * the (deferred) component signatures; if that arrow were part of the
	 * inferred `O`, a chunk component resolving hooks against this very
	 * definition would close the inference cycle (TS7022). A separate
	 * parameter is contextually typed by `PanelLazy` directly. The module
	 * type never enters `O`. Mirrors TanStack's own options/`route.lazy()`
	 * split.
	 */
	lazy?: PanelLazy,
): PanelDefinition<V, P, O> {
	return {
		[PANEL_DEFINITION]: true,
		view,
		path,
		options: lazy === undefined ? options : { ...options, lazy },
		// same formula as panelRouteId. TS cannot see the literal through the
		// template, the cast records the guarantee
		routeId: panelRouteId(view, path) as PanelRouteId<V, P>,
	};
}

/**
 * The deterministic route-id convention shared with `createApp`'s tree
 * assembly: one formula, two consumers, no drift.
 */
export function panelRouteId(view: string, path: string): string {
	return path === "index" ? `/view:${view}/` : `/view:${view}/${path}`;
}
