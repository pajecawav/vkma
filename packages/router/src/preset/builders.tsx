import { createRootRoute, createRoute, type AnyRoute } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import type { ModalEntry } from "../vkui/modals.tsx";
import type { PopoutEntry } from "../vkui/popouts.tsx";
import { AppRootShell } from "./app.tsx";
import { PANEL_DEFINITION, type PanelDefinition } from "./define-panel.ts";

/**
 * Typed builders that generate the TanStack route tree in the /vkui
 * convention: view = pathless layout route, panels = path children, modals
 * = sibling child routes of their panel (chained modals are siblings — the
 * host closes one before opening the next). Global modals are rendered by
 * the host from `?modal=<id>` on any panel (deep-linkable, unmasked in
 * v0.1). Every node accepts raw TanStack options (`loader`, `beforeLoad`,
 * `validateSearch`, `lazy`, …) passed through untouched, and the underlying
 * routes stay reachable for escape hatches.
 */

/**
 * Route options with the builder-managed fields removed. `AnyRoute`'s
 * options carry TanStack's generics pre-instanced, so this stays a plain
 * structural type; the registered route tree provides the real typing for
 * navigation, loaders and search.
 */
type LooseRouteOptions = Partial<
	Omit<NonNullable<AnyRoute>["options"], "getParentRoute" | "path" | "id">
>;

/** A modal entry component — renders its own ModalPageSurface/ModalCardSurface root. */
type ModalComponent = ComponentType;

export interface PanelOptions extends LooseRouteOptions {
	/**
	 * Chunk splitting without file-based routing: resolves to the panel's
	 * component. The preset bridges it into TanStack's `route.lazy()` (which
	 * expects a `{ options }`-shaped lazy route) and hands the caller the
	 * panel's route id. The payload is either `{ component }` or a dynamic
	 * import namespace with a `default` export (`lazy: () => import("./feed")`).
	 */
	lazy?: PanelLazy;
	/** Route-level modals: sibling child routes of this panel. */
	modals?: Record<string, ModalComponent>;
}

/**
 * The lazy loader shape: an explicit `{ component }` payload or a dynamic
 * import namespace whose `default` export is the component. The arrow keeps
 * the chunk out of the main graph; the union keeps call sites terse
 * (`lazy: () => import("./feed")`).
 */
export type PanelLazy = (
	routeId: string,
) => Promise<{ component: ComponentType } | { default: ComponentType }>;

export interface ViewOptions extends LooseRouteOptions {
	/**
	 * Panels of the view: raw inline options (small apps, wrap `lazy` in
	 * `panel()`) or a {@link PanelDefinition} from `definePanel` — the
	 * recommended shape, whose handle lives in a leaf module so panel chunks
	 * never import the app back.
	 */
	panels: Record<string, PanelOptions | PanelDefinition>;
}

export interface PanelHandle<
	TParams = Record<string, string>,
	TSearch = Record<string, unknown>,
	TLoaderData = unknown,
> {
	/** Full TanStack route id — the `from` for the /react data hooks. */
	readonly routeId: string;
	/** URL path of the panel. */
	path: string;
	/** The view route id the panel belongs to. */
	viewId: string;
	/** Phantom carrier — the panel's data types for the /react hooks. */
	readonly types?: { params: TParams; search: TSearch; loaderData: TLoaderData };
}

/** `view:feed` + panel `post/$id` → the runtime id `/view:feed/post/$id`. */
export type PanelRouteId<V extends string, P extends string> = P extends "index"
	? `/view:${V}/`
	: `/view:${V}/${P}`;

/** `$id`-segments of a panel path → the params object type. */
export type ParamsOfKey<P extends string> = P extends `${infer Head}/${infer Rest}`
	? ParamsOfSegment<Head> & ParamsOfKey<Rest>
	: ParamsOfSegment<P>;
type ParamsOfSegment<S extends string> = S extends `$${infer Name}` ? { [K in Name]: string } : {};
export type SearchOf<O extends PanelOptions> = O extends {
	validateSearch: (search: never) => infer S;
}
	? S
	: Record<string, never>;
export type LoaderDataOf<O extends PanelOptions> = O extends {
	loader: (...args: never[]) => infer L;
}
	? Awaited<L>
	: unknown;

/**
 * The options a panels-map member declares — a {@link PanelDefinition}
 * carries them in its third type parameter, raw inline options ARE the
 * options.
 */
export type OptionsOf<M extends PanelOptions | PanelDefinition> =
	M extends PanelDefinition<any, any, infer O> ? O : M;

type UnionToIntersection<U> = (U extends unknown ? (arg: U) => void : never) extends (
	arg: infer I,
) => void
	? I
	: never;

/**
 * The declared panels map with LITERAL route ids and option-derived data
 * types: `app.panels["feed/post/$id"]` autocompletes, is never undefined,
 * its `routeId` is the literal runtime id, and `usePanelParams(handle)` &
 * co. resolve params / search / loaderData from the declared options.
 */
export type PanelHandlesOf<TViews extends Record<string, ViewOptions>> = UnionToIntersection<
	{
		[V in keyof TViews & string]: {
			[P in keyof TViews[V]["panels"] & string as `${V}/${P}`]: PanelHandle<
				ParamsOfKey<P>,
				SearchOf<OptionsOf<TViews[V]["panels"][P]>>,
				LoaderDataOf<OptionsOf<TViews[V]["panels"][P]>>
			> & {
				readonly routeId: PanelRouteId<V, P>;
			};
		};
	}[keyof TViews & string]
>;

export interface AppHandle {
	routeTree: AnyRoute;
	/** Modal entries for the `<Modals>` host. */
	modals: ModalEntry[];
	/** Popout registry for the `<Popouts>` host. */
	popouts: PopoutEntry[];
	/** Panel handles keyed by `${viewKey}/${panelKey}`. */
	panels: Record<string, PanelHandle>;
	views: Record<string, AnyRoute>;
	/** Inflate flag (see {@link AppOptions.inflate}). */
	inflate: boolean;
}

/**
 * The app handle with the DECLARED panels shape: literal keys
 * (`app.panels["feed/post/$id"]` — autocomplete, never undefined) and
 * literal route ids that drive the /react hooks' typing. Structurally an
 * AppHandle, so it flows into AppRootShell / useInflate / deriveInflateChain.
 */
export interface TypedAppHandle<TViews extends Record<string, ViewOptions>> {
	routeTree: AnyRoute;
	modals: ModalEntry[];
	popouts: PopoutEntry[];
	panels: PanelHandlesOf<TViews>;
	views: Record<string, AnyRoute>;
	inflate: boolean;
}

export interface AppOptions<
	TViews extends Record<string, ViewOptions> = Record<string, ViewOptions>,
> {
	/**
	 * Custom root shell (renders inside the router context). Defaults to
	 * AppRootShell: the active view + modal/popout hosts. Deliberately
	 * LOOSE (`AppHandle`, not `TypedAppHandle<TViews>`): a contextual type
	 * mentioning TViews makes the app const's own initializer circular
	 * (TS7022) — typed panel handles are read from the RETURN value.
	 */
	root?: (props: { app: AppHandle }) => ReactNode;
	views: TViews;
	/** Global modals: `?modal=<id>` opens them from any panel. */
	modals?: Record<string, ModalComponent>;
	/** Global popout registry. */
	popouts?: Record<string, PopoutEntry["Component"]>;
	/**
	 * Inflate (default `true`): a cold start on a deep-linked panel replays
	 * the panel flow before it, so back walks the natural chain.
	 */
	inflate?: boolean;
}

/**
 * Type-erasing wrapper for `lazy` panel chunks. The chunk module imports
 * the app back for its typed panel handles — passing its component types
 * straight into `views` makes the app's own inference circular (the
 * component's inferred type depends on `app.panels`). `panel()` erases the
 * chunk to `{ component: ComponentType }` at the boundary.
 *
 * ```tsx
 * lazy: panel(() => import("./panels/feed").then(m => ({ component: m.FeedPanel })))
 * lazy: panel(routeId => import("./panels/post.lazy").then(m => m.postLazy(routeId)))
 * ```
 */
/**
 * Identity eraser for RAW inline `lazy` loaders (small apps declaring panels
 * directly in `createApp`): the chunk modules import the app back for their
 * handles, so the loader's return type must not carry the chunk's component
 * type into the app's own inference. Apps using `definePanel` don't need it
 * — the definition boundary already erases.
 */
export function panel(load: PanelLazy): PanelLazy {
	return load;
}

export function createApp<const TViews extends Record<string, ViewOptions>>(
	options: AppOptions<TViews>,
): TypedAppHandle<TViews> {
	const modals: ModalEntry[] = [];
	const popouts: PopoutEntry[] = Object.entries(options.popouts ?? {}).map(([id, Component]) => ({
		id,
		Component: Component as PopoutEntry["Component"],
	}));

	const views: Record<string, AnyRoute> = {};
	const panels: Record<string, PanelHandle> = {};
	/**
	 * TanStack finalizes route ids in `route.init()` during `createRouter` —
	 * they are not readable at build time. The handle therefore exposes
	 * GETTERS: consumers read `routeId` at render time, when the router
	 * (and the ids) already exist.
	 */
	const deferredPanels: Array<{
		key: string;
		path: string;
		route: AnyRoute;
		modals: Array<{ route: AnyRoute; Component: ComponentType }>;
	}> = [];
	/** full panel path → owning panel key, for the duplicate-path dev check */
	const usedPaths = new Map<string, string>();

	const customRoot = options.root;
	const rootRoute = createRootRoute({
		// a custom root receives the app handle (plus the raw match props);
		// the default is the auto-shell. Both close over the handle — the
		// component only runs at render time, after the binding exists.
		component: (customRoot
			? (routeProps: Record<string, unknown>) =>
					customRoot({ ...routeProps, app: handle }) as never
			: () => <AppRootShell app={handle} />) as never,
	});

	for (const [viewKey, viewOptions] of Object.entries(options.views)) {
		const { panels: viewPanels, ...viewRest } = viewOptions;
		const viewRoute = createRoute({
			getParentRoute: () => rootRoute,
			id: `view:${viewKey}`,
			...(viewRest as Partial<Record<string, unknown>>),
		});

		const panelRoutes: AnyRoute[] = [];
		for (const [panelKey, declared] of Object.entries(viewPanels)) {
			// a definition carries its options inside; raw options ARE the options
			const panelOptions: PanelOptions =
				PANEL_DEFINITION in declared ? declared.options : declared;
			if (PANEL_DEFINITION in declared && declared.view !== viewKey) {
				console.error(
					`[vkma-router] panel "${panelKey}" is defined for view "${declared.view}" but nested under "views.${viewKey}"; its handle route id and the tree would disagree`,
				);
			}
			const { modals: panelModals, lazy, ...panelRest } = panelOptions;
			const panelPath = panelKey === "index" ? "/" : panelKey;
			// dev check: two panels with the same full path silently break
			// matching (the router resolves the conflict arbitrarily) — a
			// multi-view app must give every home panel its own segment
			const pathOwner = usedPaths.get(panelPath);
			if (pathOwner !== undefined) {
				console.error(
					`[vkma-router] duplicate panel path "${panelPath}" (${pathOwner} and ${viewKey}/${panelKey}); only one view may own "/" — give the other home panels distinct path segments (e.g. "feed")`,
				);
			} else {
				usedPaths.set(panelPath, `${viewKey}/${panelKey}`);
			}
			const panelRoute = createRoute({
				getParentRoute: () => viewRoute,
				path: panelPath,
				staticData: { panel: `${viewKey}/${panelKey}` },
				...(panelRest as Partial<Record<string, unknown>>),
			});
			if (lazy !== undefined) {
				// runs on match load — the router (and ids) exist by then;
				// TanStack's route.lazy() merges `lazyRoute.options`, the
				// builder bridges the plain-options contract (both payload
				// shapes) into that shape
				panelRoute.lazy(
					() =>
						Promise.resolve(lazy(panelRoute.id)).then(payload => ({
							options:
								"component" in payload ? payload : { component: payload.default },
						})) as never,
				);
			}
			const modalRoutes: Array<{ route: AnyRoute; Component: ComponentType }> = [];
			for (const [modalKey, Modal] of Object.entries(panelModals ?? {})) {
				const modalRoute = createRoute({
					getParentRoute: () => panelRoute,
					path: modalKey,
					staticData: { modal: `${viewKey}/${panelKey}/${modalKey}` },
				});
				modalRoutes.push({ route: modalRoute, Component: Modal as ComponentType });
			}
			// addChildren REPLACES the children array — one call after the loop
			// (per-modal calls would orphan every modal but the last)
			panelRoute.addChildren(modalRoutes.map(m => m.route));
			panelRoutes.push(panelRoute);
			deferredPanels.push({
				key: `${viewKey}/${panelKey}`,
				path: panelPath,
				route: panelRoute,
				modals: modalRoutes,
			});
		}

		viewRoute.addChildren(panelRoutes);
		views[viewKey] = viewRoute;
	}

	rootRoute.addChildren(Object.values(views));

	for (const { key, path, route, modals: panelModalEntries } of deferredPanels) {
		panels[key] = {
			get routeId() {
				return route.id;
			},
			path,
			get viewId() {
				return route.id.split("/")[0] ?? "";
			},
		};
		for (const { route: modalRoute, Component } of panelModalEntries) {
			modals.push({
				get routeId() {
					return modalRoute.id;
				},
				get id() {
					return modalRoute.id;
				},
				Component,
			});
		}
	}

	// global modals: no route — the Modals host opens them from the
	// `?modal=<id>` search param on any panel (deep-linkable, unmasked in v0.1)
	for (const [modalKey, Modal] of Object.entries(options.modals ?? {})) {
		modals.push({
			routeId: `?modal=${modalKey}`,
			id: modalKey,
			Component: Modal as ComponentType,
		});
	}

	const handle: AppHandle = {
		routeTree: rootRoute,
		modals,
		popouts,
		panels,
		views,
		inflate: options.inflate ?? true,
	};
	// the runtime shape matches; the literal route-id types are only
	// computable through the caller's generic
	return handle as unknown as TypedAppHandle<TViews>;
}
