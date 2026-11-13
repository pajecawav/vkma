import {
	createRootRoute,
	createRoute,
	createRouteMask,
	type AnyRoute,
	type RouteMask,
} from "@tanstack/react-router";
import type { ComponentType, LazyExoticComponent, ReactNode } from "react";
import type { ModalEntry } from "../vkui/modals.tsx";
import type { PopoutEntry } from "../vkui/popouts.tsx";
import { AppRootShell } from "./app.tsx";
import { PANEL_DEFINITION, type PanelDefinition } from "./define-panel.ts";
import { VIEW_DEFINITION, type ViewDefinition } from "./define-view.ts";
import {
	asDeclaration,
	isGlobalModalDefinition,
	isPopoutDefinition,
	type GlobalModalDefinition,
	type ModalHandle,
	type ModalHandlesOf,
	modalHandlesOf,
	type PopoutComponent,
	type PopoutDefinition,
	type PopoutHandle,
	type PopoutHandlesOf,
	popoutHandlesOf,
} from "./overlays.ts";

/**
 * Typed builders that generate the TanStack route tree in the /vkui
 * convention: view = pathless layout route, panels = path children, modals
 * = sibling child routes of their panel (chained modals are siblings. The
 * host closes one before opening the next). Local route modals are
 * URL-masked back to their panel (`app.routeMasks` → `createRouter`'s
 * `routeMasks`): the address stays at the panel while any modal level is
 * open, the raw modal path still deep-links (parsing is never masked), and
 * the mask survives reload (history.state.__tempLocation). Global modals
 * are rendered by the host from `?modal=<id>` on any panel (deep-linkable;
 * the imperative open carries its own mask). Every node accepts raw
 * TanStack options (`loader`, `beforeLoad`, `validateSearch`, `lazy`, …)
 * passed through untouched, and the underlying routes stay reachable for
 * escape hatches.
 */

/**
 * Route options with the builder-managed fields removed. `AnyRoute`'s
 * options carry TanStack's generics pre-instanced, so this stays a plain
 * structural type; the registered route tree provides the real typing for
 * navigation, loaders and search.
 */
export type LooseRouteOptions = Partial<
	Omit<NonNullable<AnyRoute>["options"], "getParentRoute" | "path" | "id">
>;

/** A renderable modal entry component, plain or React.lazy. */
export type ModalEntryComponent = ComponentType | LazyExoticComponent<ComponentType>;

/**
 * A declared modal: a renderable component, or a component with ITS OWN
 * nested modals. Nested modals are child routes of their parent modal and
 * stack ON TOP of it (back unwinds the stack instead of closing everything).
 * `props` is a TYPE-ONLY carrier for the modal's runtime props (read via
 * `useModalProps`): the value is never used, the declaration site writes
 * `props: {} as ShareProps`.
 */
export interface ModalDeclaration {
	component: ModalEntryComponent;
	modals?: Record<string, ModalComponent>;
	props?: unknown;
}

/** What a modals record accepts: either shape. */
export type ModalComponent = ModalEntryComponent | ModalDeclaration;

export interface PanelOptions extends LooseRouteOptions {
	/**
	 * Chunk splitting without file-based routing: resolves to the panel's
	 * component. The preset bridges it into TanStack's `route.lazy()` (which
	 * expects a `{ options }`-shaped lazy route) and hands the caller the
	 * panel's route id. The payload is either `{ component }` or a dynamic
	 * import namespace with a `default` export (`lazy: () => import("./feed")`).
	 */
	lazy?: PanelLazy;
	/** Route-level modals: sibling child routes of this panel (recursible). */
	modals?: Record<string, ModalComponent>;
	/**
	 * Panel-local popouts: resolved BEFORE the global registry while this
	 * panel is the deepest matched one. The same id declared globally is a
	 * dev-time error. Values are components (props infer from the
	 * signature) or `definePopout` definitions.
	 */
	popouts?: Record<string, PopoutComponent | PopoutDefinition>;
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
	 * `panel()`) or a {@link PanelDefinition} from `definePanel`, the
	 * recommended shape, whose handle lives in a leaf module so panel chunks
	 * never import the app back.
	 */
	panels: Record<string, PanelOptions | PanelDefinition>;
}

export interface PanelHandle<
	TParams = Record<string, string>,
	TSearch = Record<string, unknown>,
	TLoaderData = unknown,
	TModals extends Record<string, ModalHandle> = Record<string, ModalHandle>,
	TPopouts extends Record<string, PopoutHandle> = Record<string, PopoutHandle>,
> {
	/** Full TanStack route id, the `from` for the /react data hooks. */
	readonly routeId: string;
	/** URL path of the panel. */
	path: string;
	/** The view route id the panel belongs to. */
	viewId: string;
	/** Typed modal handles (flattened dotted keys for nested chains). */
	modals: TModals;
	/** Typed popout handles (props phantom from the declared components). */
	popouts: TPopouts;
	/** Phantom carrier, the panel's data types for the /react hooks. */
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
 * The options a panels-map member declares. A {@link PanelDefinition}
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
 * `modals` / `popouts` are the typed overlay handle maps.
 */
export type PanelHandlesOf<TViews extends Record<string, ViewOptions>> = UnionToIntersection<
	{
		[V in keyof TViews & string]: {
			[P in keyof TViews[V]["panels"] & string as `${V}/${P}`]: PanelHandle<
				ParamsOfKey<P>,
				SearchOf<OptionsOf<TViews[V]["panels"][P]>>,
				LoaderDataOf<OptionsOf<TViews[V]["panels"][P]>>,
				ModalHandlesOf<P, OptionsOf<TViews[V]["panels"][P]>>,
				PopoutHandlesOf<OptionsOf<TViews[V]["panels"][P]>>
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
	/**
	 * Declarative URL masks for the local route modals. Pass into
	 * `createRouter({ routeMasks })`, or a modal open puts its own path in
	 * the address bar.
	 */
	routeMasks: RouteMask<any>[];
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
 * (`app.panels["feed/post/$id"]`, autocomplete, never undefined) and
 * literal route ids that drive the /react hooks' typing. Structurally an
 * AppHandle, so it flows into AppRootShell / useInflate / deriveInflateChain.
 */
export interface TypedAppHandle<TViews extends Record<string, ViewOptions>> {
	routeTree: AnyRoute;
	modals: ModalEntry[];
	routeMasks: RouteMask<any>[];
	popouts: PopoutEntry[];
	panels: PanelHandlesOf<TViews>;
	views: Record<string, AnyRoute>;
	inflate: boolean;
}

export interface AppOptionsBase {
	/**
	 * Custom root shell (renders inside the router context). Defaults to
	 * AppRootShell: the active view + modal/popout hosts. Deliberately
	 * LOOSE (`AppHandle`, not `TypedAppHandle<TViews>`): a contextual type
	 * mentioning TViews makes the app const's own initializer circular
	 * (TS7022). Typed panel handles are read from the RETURN value.
	 */
	root?: (props: { app: AppHandle }) => ReactNode;
	/**
	 * Global modals: `?modal=<id>` opens them from any panel. Values are
	 * components or `defineGlobalModal` definitions (the recommended
	 * form — the definition doubles as the typed handle).
	 */
	modals?: Record<string, ModalEntryComponent | GlobalModalDefinition>;
	/**
	 * Global popout registry. Values are components (props infer from the
	 * signature) or `definePopout` definitions (the typed-handle form).
	 */
	popouts?: Record<string, PopoutComponent | PopoutDefinition>;
	/**
	 * Inflate (default `true`): a cold start on a deep-linked panel replays
	 * the panel flow before it, so back walks the natural chain.
	 */
	inflate?: boolean;
}

export interface AppOptions<
	TViews extends Record<string, ViewOptions> = Record<string, ViewOptions>,
> extends AppOptionsBase {
	views: TViews;
}

/** `createApp` with `defineView` hubs: handles live on the panel definitions. */
export interface AppDefinitionOptions extends AppOptionsBase {
	views: readonly ViewDefinition[] | Record<string, ViewDefinition>;
}

/**
 * Type-erasing wrapper for `lazy` panel chunks. The chunk module imports
 * the app back for its typed panel handles. Passing its component types
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
 * type into the app's own inference. Apps using `definePanel` don't need it.
 * The definition boundary already erases.
 */
export function panel(load: PanelLazy): PanelLazy {
	return load;
}

/** Normalized view entries the builder loop consumes. */
interface DeclaredView {
	viewKey: string;
	viewRest: LooseRouteOptions;
	viewPanels: Record<string, PanelOptions | PanelDefinition>;
}

function normalizeViews(views: unknown): DeclaredView[] {
	if (Array.isArray(views)) {
		return (views as readonly ViewDefinition[]).map(definition => ({
			viewKey: definition.view,
			viewRest: definition.options ?? {},
			viewPanels: { ...definition.panels },
		}));
	}
	return Object.entries(views as Record<string, unknown>).map(([viewKey, declared]) => {
		if (VIEW_DEFINITION in (declared as object)) {
			const definition = declared as ViewDefinition;
			if (definition.view !== viewKey) {
				console.error(
					`[vkma-router] view "${definition.view}" is nested under key "${viewKey}"; the hub's view string and the nesting key must match`,
				);
			}
			return {
				viewKey: definition.view,
				viewRest: definition.options ?? {},
				viewPanels: { ...definition.panels },
			};
		}
		const { panels, ...viewRest } = declared as ViewOptions;
		return { viewKey, viewRest: viewRest as LooseRouteOptions, viewPanels: panels ?? {} };
	});
}

/**
 * Build a modal subtree under `parentRoute` (a panel or a parent modal) and
 * register every entry (flat) into the host registry. Nested modals are
 * child routes of their parent modal. The stacking is expressed by the
 * route tree itself.
 */
function createModalTree(
	parentRoute: AnyRoute,
	modals: Record<string, ModalComponent>,
	registry: ModalEntry[],
	baseKey: string,
	/** Full path of the OWNING panel: every level's mask displays it. */
	panelFullPath: string,
	/** Full path of the parent in the modal chain (panel or parent modal). */
	parentFullPath: string,
	/** Mask pairs collected for the whole app, mapped to RouteMask later. */
	masks: Array<{ from: string; to: string }>,
): AnyRoute[] {
	const routes: AnyRoute[] = [];
	for (const [modalKey, declared] of Object.entries(modals)) {
		const { component, modals: nested } = asDeclaration(declared);
		const modalRoute = createRoute({
			getParentRoute: () => parentRoute,
			path: modalKey,
			staticData: { modal: `${baseKey}/${modalKey}` },
		});
		const modalFullPath =
			parentFullPath === "/" ? `/${modalKey}` : `${parentFullPath}/${modalKey}`;
		// while ANY level of the chain is open the URL keeps showing the
		// OWNING panel's path. Nested levels mask to the panel too, so the
		// display never leaks a modal segment (the raw modal path still
		// deep-links: parsing is never masked)
		masks.push({ from: modalFullPath, to: panelFullPath });
		registry.push({
			get routeId() {
				return modalRoute.id;
			},
			get id() {
				return modalRoute.id;
			},
			Component: component,
		});
		routes.push(modalRoute);
		if (nested !== undefined) {
			const children = createModalTree(
				modalRoute,
				nested,
				registry,
				`${baseKey}/${modalKey}`,
				panelFullPath,
				modalFullPath,
				masks,
			);
			if (children.length > 0) {
				// addChildren REPLACES the children array: one call per route
				modalRoute.addChildren(children);
			}
		}
	}
	return routes;
}

/** Definition-form views: the typed handles live on the panel definitions. */
export function createApp(options: AppDefinitionOptions): AppHandle;
/** Raw inline options: `app.panels` is fully typed from the declared tree. */
export function createApp<const TViews extends Record<string, ViewOptions>>(
	options: AppOptions<TViews>,
): TypedAppHandle<TViews>;
export function createApp(options: AppOptions | AppDefinitionOptions): any {
	const modals: ModalEntry[] = [];
	const pendingMasks: Array<{ from: string; to: string }> = [];
	const globalPopoutComponents = Object.entries(options.popouts ?? {}).map(([id, declared]) => {
		if (isPopoutDefinition(declared) && declared.popout !== id) {
			console.error(
				`[vkma-router] popout "${declared.popout}" is nested under key "${id}"; the definition's id and the nesting key must match`,
			);
		}
		return {
			id,
			Component: isPopoutDefinition(declared) ? declared.Component : declared,
		};
	});
	const popouts: PopoutEntry[] = globalPopoutComponents.map(({ id, Component }) => ({
		id,
		Component,
	}));
	const globalPopoutIds = new Set(Object.keys(options.popouts ?? {}));

	const views: Record<string, AnyRoute> = {};
	const panels: Record<string, PanelHandle> = {};
	/**
	 * TanStack finalizes route ids in `route.init()` during `createRouter`.
	 * They are not readable at build time. The handle therefore exposes
	 * GETTERS: consumers read `routeId` at render time, when the router
	 * (and the ids) already exist. The overlay handle maps are computed
	 * at build time (paths and registry ids are static), but deferred to
	 * the same loop so definitions and raw options flow through one path.
	 */
	const deferredPanels: Array<{
		key: string;
		path: string;
		route: AnyRoute;
		modals: Record<string, ModalHandle>;
		popouts: Record<string, PopoutHandle>;
	}> = [];
	/** full panel path → owning panel key, for the duplicate-path dev check */
	const usedPaths = new Map<string, string>();
	const usedViewKeys = new Set<string>();

	const customRoot = options.root;
	const rootRoute = createRootRoute({
		// a custom root receives the app handle (plus the raw match props);
		// the default is the auto-shell. Both close over the handle. The
		// component only runs at render time, after the binding exists.
		component: (customRoot
			? (routeProps: Record<string, unknown>) =>
					customRoot({ ...routeProps, app: handle }) as never
			: () => <AppRootShell app={handle} />) as never,
	});

	for (const { viewKey, viewRest, viewPanels } of normalizeViews(options.views)) {
		if (usedViewKeys.has(viewKey)) {
			console.error(
				`[vkma-router] duplicate view "${viewKey}"; a view must be declared exactly once (one defineView hub)`,
			);
			continue;
		}
		usedViewKeys.add(viewKey);
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
			const { modals: panelModals, lazy, popouts: panelPopouts, ...panelRest } = panelOptions;
			// panel-local popouts: resolved before the global registry while
			// this panel is the deepest matched one; a global id collision is
			// a dev-time error (the local declaration would shadow it)
			const panelRegistryKey = `${viewKey}/${panelKey}`;
			const localPopoutIds = new Set<string>();
			for (const [popoutId, declared] of Object.entries(panelPopouts ?? {})) {
				if (isPopoutDefinition(declared) && declared.popout !== popoutId) {
					console.error(
						`[vkma-router] popout "${declared.popout}" is nested under key "${popoutId}" on panel "${panelRegistryKey}"; the definition's id and the nesting key must match`,
					);
				}
				if (globalPopoutIds.has(popoutId)) {
					console.error(
						`[vkma-router] popout "${popoutId}" is declared both globally and on panel "${panelRegistryKey}"; the local one shadows the global — rename one of them`,
					);
				}
				if (localPopoutIds.has(popoutId)) {
					console.error(
						`[vkma-router] duplicate popout "${popoutId}" on panel "${panelRegistryKey}"`,
					);
					continue;
				}
				localPopoutIds.add(popoutId);
				popouts.push({
					id: popoutId,
					Component: isPopoutDefinition(declared) ? declared.Component : declared,
					panel: panelRegistryKey,
				});
			}
			const panelPath = panelKey === "index" ? "/" : panelKey;
			// dev check: two panels with the same full path silently break
			// matching (the router resolves the conflict arbitrarily). A
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
				// runs on match load, so the router (and ids) exist by then;
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
			// the modal subtree (nested modals are child routes of their
			// parent modal); entries register flat into the host registry.
			// The view is a pathless layout route. The panel's full path is
			// just its declared path rooted at "/"
			const panelFullPath = panelPath === "/" ? "/" : `/${panelPath.replace(/^\//, "")}`;
			const modalRoutes = createModalTree(
				panelRoute,
				panelModals ?? {},
				modals,
				`${viewKey}/${panelKey}`,
				panelFullPath,
				panelFullPath,
				pendingMasks,
			);
			// addChildren REPLACES the children array: one call after the loop
			// (per-modal calls would orphan every modal but the last)
			panelRoute.addChildren(modalRoutes);
			panelRoutes.push(panelRoute);
			// the overlay handle maps: a definition already carries them
			// (built from the same options by definePanel — one formula,
			// no drift); raw options get them computed here
			deferredPanels.push({
				key: `${viewKey}/${panelKey}`,
				path: panelPath,
				route: panelRoute,
				modals:
					PANEL_DEFINITION in declared
						? declared.modals
						: modalHandlesOf(panelKey, panelModals ?? {}),
				popouts:
					PANEL_DEFINITION in declared
						? declared.popouts
						: popoutHandlesOf(panelPopouts ?? {}),
			});
		}

		viewRoute.addChildren(panelRoutes);
		views[viewKey] = viewRoute;
	}

	rootRoute.addChildren(Object.values(views));

	// Declarative masks for the local route modals: while a modal is open
	// the router displays the owning panel's path (createRouteMask is
	// identity. The router matches `from` at navigation time and stores
	// the real location in history.state.__tempLocation, so the raw modal
	// path still deep-links and the mask survives reload)
	const routeMasks = pendingMasks.map(
		mask =>
			createRouteMask({
				routeTree: rootRoute as never,
				from: mask.from,
				to: mask.to,
				// modal routes are children of their panel, so the params ($id, …)
				// are shared, forward them to the displayed location wholesale
				params: true,
			} as never) as RouteMask<any>,
	);

	for (const {
		key,
		path,
		route,
		modals: panelModalHandles,
		popouts: panelPopoutHandles,
	} of deferredPanels) {
		panels[key] = {
			get routeId() {
				return route.id;
			},
			path,
			get viewId() {
				// runtime ids carry a leading slash: "/view:feed", so split("/")[0]
				// is ALWAYS "" (that silently broke the inflate view filter: every
				// panel matched every view, so a cold home deep link replayed the
				// first other view's panels before the target)
				const match = String(route.id).match(/^\/?view:([^/]+)/);
				return match?.[1] ?? String(route.id);
			},
			modals: panelModalHandles,
			popouts: panelPopoutHandles,
		};
	}

	// global modals: no route. The Modals host opens them from the
	// `?modal=<id>` search param on any panel (deep-linkable; the
	// imperative open in useNavigator masks the URL back to the panel)
	for (const [modalKey, declared] of Object.entries(options.modals ?? {})) {
		if (isGlobalModalDefinition(declared)) {
			// the id is written where the modal lives; the nesting key must
			// agree or the deep link and the handle would disagree
			if (declared.modal !== modalKey) {
				console.error(
					`[vkma-router] global modal "${declared.modal}" is nested under key "${modalKey}"; the definition's id and the nesting key must match`,
				);
			}
			modals.push({
				routeId: `?modal=${modalKey}`,
				id: modalKey,
				Component: declared.component,
			});
			continue;
		}
		modals.push({
			routeId: `?modal=${modalKey}`,
			id: modalKey,
			Component: declared,
		});
	}

	const handle: AppHandle = {
		routeTree: rootRoute,
		modals,
		routeMasks,
		popouts,
		panels,
		views,
		inflate: options.inflate ?? true,
	};
	// the TypedAppHandle overload's literal route-id types are only
	// computable through the caller's generic
	return handle;
}
