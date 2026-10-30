import type { AnyRoute } from "@tanstack/react-router";
import { useRouterState } from "@tanstack/react-router";
import { Panel, PanelHeader, PanelSpinner, View } from "@vkontakte/vkui";
import { type ComponentType } from "react";
import { usePanelsHistory } from "../react/hooks.ts";

export interface PanelStaticData {
	panel: string;
}

export function panelIdOf(route: AnyRoute): string {
	return (route.options.staticData as PanelStaticData | undefined)?.panel ?? "";
}

function deepestPanelMatchId(view: AnyRoute, matchedRouteIds: string[]): string {
	const panelIds = new Set(view.children.map((child: AnyRoute) => child.id));
	for (let i = matchedRouteIds.length - 1; i >= 0; i--) {
		const id = matchedRouteIds[i];
		if (id !== undefined && panelIds.has(id)) {
			return id;
		}
	}
	return view.children[0]?.id ?? "";
}

function useMatchSummaries(): string {
	return useRouterState({
		select: state =>
			// routeId + status: a lazy panel's chunk resolution flips the match
			// status, which must re-render the static children (the resolved
			// component merges into route.options at that point)
			state.matches.map(match => `${match.routeId}#${match.status}`).join("|"),
	});
}

/**
 * The VKUI nav key of a view route: "/view:feed" → "feed". Epic/Root match
 * children by getNavId, so the raw route id would leak the route-tree
 * convention into the UI layer. This is also the key the app author wrote
 * in `defineView("feed")`.
 */
export function storyKeyOf(routeId: unknown): string {
	const id = String(routeId);
	return id.split(":")[1] ?? id;
}

export interface VkViewProps {
	/** The pathless view layout route created by the preset. */
	view: AnyRoute;
	/** VKUI nav id of the View. Defaults to the story key (the defineView key). */
	nav?: string;
	/** Native swipe-back pop; defaults to `window.history.back()`. */
	onSwipeBack?: () => void;
}

/**
 * Static-children view: every panel route renders as an always-present JSX
 * child of VKUI <View>; the router only feeds `activePanel` (and `history`
 * for the iOS swipe-back). VKUI hides inactive panels itself and infers
 * the animation direction from the children order — a plain <Outlet>
 * breaks both. A lazy panel's `options.component` is undefined until its
 * chunk resolves (TanStack merges loaded options in place), so the panel
 * renders a spinner fallback until then. For the same reason TanStack's
 * Outlet-driven `pendingComponent` swap never happens on its own — while
 * the panel's match is pending (loader/beforeLoad), the route's
 * `pendingComponent` renders instead of the component.
 */
export function VkView({ view, nav, onSwipeBack }: VkViewProps) {
	useMatchSummaries();
	const matchedRouteIds = useRouterState({
		select: state => state.matches.map(match => match.routeId),
	});
	// structurally-compared array — TanStack keeps the reference stable when
	// the selection is deep-equal. TanStack's Outlet would swap in the
	// route's pendingComponent itself, but static children render the
	// component directly, so the swap is ours to make while the loader runs
	const pendingRouteIds = useRouterState({
		select: state =>
			state.matches
				.filter(match => (match as { status?: string }).status === "pending")
				.map(match => String(match.routeId)),
	});
	// a notFound match (notFound() from beforeLoad/validateSearch) must NOT
	// render its panel component: the component's data guards assume a valid
	// match, and the shell renders the NotFound screen for this navigation —
	// the panel itself stays invisible. Without the gate the component would
	// throw in a transient render and dirty the console on every cold 404
	const notFoundRouteIds = useRouterState({
		select: state =>
			state.matches
				.filter(match => (match as { status?: string }).status === "notFound")
				.map(match => String(match.routeId)),
	});
	const activeRouteId = deepestPanelMatchId(view, matchedRouteIds);
	const activeChild =
		view.children.find((child: AnyRoute) => child.id === activeRouteId) ?? view.children[0];
	const activePanel = activeChild ? panelIdOf(activeChild) : "";

	const history = usePanelsHistory(activePanel);

	return (
		<View
			nav={nav ?? storyKeyOf(view.id)}
			activePanel={activePanel}
			history={history}
			onSwipeBack={onSwipeBack ?? (() => window.history.back())}
		>
			{view.children.map((child: AnyRoute) => {
				const id = panelIdOf(child);
				const Component = child.options.component as ComponentType | undefined;
				const Pending = child.options.pendingComponent as ComponentType | undefined;
				const isPending = pendingRouteIds.includes(String(child.id));
				const isNotFound = notFoundRouteIds.includes(String(child.id));
				// pending without a pendingComponent renders the FALLBACK, never
				// the component: a lazy chunk may have already merged its
				// component while the match is still pending (or parked on a
				// notFound boundary up the tree) — the component's data guards
				// assume a resolvable match and would throw in a hidden panel
				return (
					<Panel key={id} nav={id}>
						{isPending ? (
							Pending !== undefined ? (
								<Pending />
							) : (
								<PanelSpinnerFallback />
							)
						) : isNotFound ? (
							<PanelSpinnerFallback />
						) : Component ? (
							<Component />
						) : (
							<PanelSpinnerFallback />
						)}
					</Panel>
				);
			})}
		</View>
	);
}

function PanelSpinnerFallback() {
	// The canonical VKUI loading screen: a header stub keeps the layout
	// structure while the lazy chunk is in flight, and PanelSpinner centers
	// itself inside the panel (a bare Spinner floats at the top of a void).
	return (
		<>
			<PanelHeader />
			<PanelSpinner size="l" />
		</>
	);
}
