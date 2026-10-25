import { createRootRoute, createRoute, type AnyRoute } from "@tanstack/react-router";
import type { ComponentType, ReactNode } from "react";
import type { ModalEntry } from "../vkui/modals.tsx";
import type { PopoutEntry } from "../vkui/popouts.tsx";
import { AppRootShell } from "./app.tsx";

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

type ModalComponent = ComponentType;

export interface PanelOptions extends LooseRouteOptions {
	/**
	 * Chunk splitting without file-based routing: resolves to the panel's
	 * component. The preset bridges it into TanStack's `route.lazy()` (which
	 * expects a `{ options }`-shaped lazy route) and hands the caller the
	 * panel's route id. The preset calls `route.lazy()` with the resolved
	 * options.
	 */
	lazy?: (routeId: string) => Promise<{ component: ComponentType }>;
	/** Route-level modals: sibling child routes of this panel. */
	modals?: Record<string, ModalComponent>;
}

export interface ViewOptions extends LooseRouteOptions {
	panels: Record<string, PanelOptions>;
}

export interface AppOptions {
	/**
	 * Custom root shell (renders inside the router context). Defaults to
	 * AppRootShell: the active view + modal/popout hosts.
	 */
	root?: (props: { app: AppHandle }) => ReactNode;
	views: Record<string, ViewOptions>;
	/** Global modals: `?modal=<id>` opens them from any panel. */
	modals?: Record<string, ModalComponent>;
	/** Global popout registry. */
	popouts?: Record<string, PopoutEntry["Component"]>;
}

export interface PanelHandle {
	/** Full TanStack route id — the `from` for the /react data hooks. */
	routeId: string;
	/** URL path of the panel. */
	path: string;
	/** The view route id the panel belongs to. */
	viewId: string;
}

export interface AppHandle {
	routeTree: AnyRoute;
	/** Modal entries for the `<Modals>` host. */
	modals: ModalEntry[];
	/** Popout registry for the `<Popouts>` host. */
	popouts: PopoutEntry[];
	/** Panel handles keyed by `${viewKey}/${panelKey}`. */
	panels: Record<string, PanelHandle>;
	views: Record<string, AnyRoute>;
}

export function createApp(options: AppOptions): AppHandle {
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

	const rootRoute = createRootRoute({
		component: (options.root ?? (() => <AppRootShell app={handle} />)) as never,
	});

	for (const [viewKey, viewOptions] of Object.entries(options.views)) {
		const { panels: viewPanels, ...viewRest } = viewOptions;
		const viewRoute = createRoute({
			getParentRoute: () => rootRoute,
			id: `view:${viewKey}`,
			...(viewRest as Partial<Record<string, unknown>>),
		});

		const panelRoutes: AnyRoute[] = [];
		for (const [panelKey, panelOptions] of Object.entries(viewPanels)) {
			const { modals: panelModals, lazy, ...panelRest } = panelOptions;
			const panelPath = panelKey === "index" ? "/" : panelKey;
			const panelRoute = createRoute({
				getParentRoute: () => viewRoute,
				path: panelPath,
				staticData: { panel: `${viewKey}/${panelKey}` },
				...(panelRest as Partial<Record<string, unknown>>),
			});
			if (lazy !== undefined) {
				// runs on match load — the router (and ids) exist by then;
				// TanStack's route.lazy() merges `lazyRoute.options`, the
				// builder bridges the plain-options contract into that shape
				panelRoute.lazy(
					() =>
						Promise.resolve(lazy(panelRoute.id)).then(lazyOptions => ({
							options: lazyOptions,
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
	};
	return handle;
}
