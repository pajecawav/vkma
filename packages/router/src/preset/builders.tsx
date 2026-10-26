import { createRootRoute, createRoute, type AnyRoute } from "@tanstack/react-router";
import type { ComponentType, LazyExoticComponent, ReactNode } from "react";
import type { ModalEntry } from "../vkui/modals.tsx";
import type { PopoutEntry } from "../vkui/popouts.tsx";
import { AppRootShell } from "./app.tsx";
import { PANEL_DEFINITION, type PanelDefinition } from "./define-panel.ts";
import { VIEW_DEFINITION, type ViewDefinition } from "./define-view.ts";

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
export type LooseRouteOptions = Partial<
	Omit<NonNullable<AnyRoute>["options"], "getParentRoute" | "path" | "id">
>;

/** A renderable modal entry component — plain or React.lazy. */
export type ModalEntryComponent = ComponentType | LazyExoticComponent<ComponentType>;

/**
 * A declared modal: a renderable component, or a component with ITS OWN
 * nested modals. Nested modals are child routes of their parent modal and
 * stack ON TOP of it (back unwinds the stack instead of closing everything).
 */
export interface ModalDeclaration {
	component: ModalEntryComponent;
	modals?: Record<string, ModalComponent>;
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

export interface AppOptionsBase {
	/**
	 * Custom root shell (renders inside the router context). Defaults to
	 * AppRootShell: the active view + modal/popout hosts. Deliberately
	 * LOOSE (`AppHandle`, not `TypedAppHandle<TViews>`): a contextual type
	 * mentioning TViews makes the app const's own initializer circular
	 * (TS7022) — typed panel handles are read from the RETURN value.
	 */
	root?: (props: { app: AppHandle }) => ReactNode;
	/** Global modals: `?modal=<id>` opens them from any panel. */
	modals?: Record<string, ModalEntryComponent>;
	/** Global popout registry. */
	popouts?: Record<string, PopoutEntry["Component"]>;
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

/** `createApp` with `defineView` hubs — handles live on the panel definitions. */
export interface AppDefinitionOptions extends AppOptionsBase {
	views: readonly ViewDefinition[] | Record<string, ViewDefinition>;
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
			viewRest: (definition.options ?? {}) as LooseRouteOptions,
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
				viewRest: (definition.options ?? {}) as LooseRouteOptions,
				viewPanels: { ...definition.panels },
			};
		}
		const { panels, ...viewRest } = declared as ViewOptions;
		return { viewKey, viewRest: viewRest as LooseRouteOptions, viewPanels: panels ?? {} };
	});
}

/** Normalize a declared modal into its declaration form. */
function asDeclaration(value: ModalComponent): ModalDeclaration {
	// shape check, NOT typeof: lazy/memo/forwardRef components are objects
	return typeof value === "object" && value !== null && "component" in value
		? value
		: { component: value as ModalEntryComponent };
}

/**
 * Build a modal subtree under `parentRoute` (a panel or a parent modal) and
 * register every entry (flat) into the host registry. Nested modals are
 * child routes of their parent modal — the stacking is expressed by the
 * route tree itself.
 */
function createModalTree(
	parentRoute: AnyRoute,
	modals: Record<string, ModalComponent>,
	registry: ModalEntry[],
	baseKey: string,
): AnyRoute[] {
	const routes: AnyRoute[] = [];
	for (const [modalKey, declared] of Object.entries(modals)) {
		const { component, modals: nested } = asDeclaration(declared);
		const modalRoute = createRoute({
			getParentRoute: () => parentRoute,
			path: modalKey,
			staticData: { modal: `${baseKey}/${modalKey}` },
		});
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
			);
			if (children.length > 0) {
				// addChildren REPLACES the children array — one call per route
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
	}> = [];
	/** full panel path → owning panel key, for the duplicate-path dev check */
	const usedPaths = new Map<string, string>();
	const usedViewKeys = new Set<string>();

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
			// the modal subtree (nested modals are child routes of their
			// parent modal); entries register flat into the host registry
			const modalRoutes = createModalTree(
				panelRoute,
				panelModals ?? {},
				modals,
				`${viewKey}/${panelKey}`,
			);
			// addChildren REPLACES the children array — one call after the loop
			// (per-modal calls would orphan every modal but the last)
			panelRoute.addChildren(modalRoutes);
			panelRoutes.push(panelRoute);
			deferredPanels.push({
				key: `${viewKey}/${panelKey}`,
				path: panelPath,
				route: panelRoute,
			});
		}

		viewRoute.addChildren(panelRoutes);
		views[viewKey] = viewRoute;
	}

	rootRoute.addChildren(Object.values(views));

	for (const { key, path, route } of deferredPanels) {
		panels[key] = {
			get routeId() {
				return route.id;
			},
			path,
			get viewId() {
				// runtime ids carry a leading slash: "/view:feed" — split("/")[0]
				// is ALWAYS "" (that silently broke the inflate view filter: every
				// panel matched every view, so a cold home deep link replayed the
				// first other view's panels before the target)
				const match = String(route.id).match(/^\/?view:([^/]+)/);
				return match?.[1] ?? String(route.id);
			},
		};
	}

	// global modals: no route — the Modals host opens them from the
	// `?modal=<id>` search param on any panel (deep-linkable, unmasked in v0.1)
	for (const [modalKey, Modal] of Object.entries(options.modals ?? {})) {
		modals.push({
			routeId: `?modal=${modalKey}`,
			id: modalKey,
			Component: Modal,
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
	// the TypedAppHandle overload's literal route-id types are only
	// computable through the caller's generic
	return handle;
}
