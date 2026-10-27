import type { AnyRoute } from "@tanstack/react-router";
import { useRouterState } from "@tanstack/react-router";
import { Panel, Spinner, View } from "@vkontakte/vkui";
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

export interface VkViewProps {
	/** The pathless view layout route created by the preset. */
	view: AnyRoute;
	/** VKUI nav id of the View. Defaults to the route id. */
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
	const activeRouteId = deepestPanelMatchId(view, matchedRouteIds);
	const activeChild =
		view.children.find((child: AnyRoute) => child.id === activeRouteId) ?? view.children[0];
	const activePanel = activeChild ? panelIdOf(activeChild) : "";

	const history = usePanelsHistory(activePanel);

	return (
		<View
			nav={nav ?? view.id}
			activePanel={activePanel}
			history={history}
			onSwipeBack={onSwipeBack ?? (() => window.history.back())}
		>
			{view.children.map((child: AnyRoute) => {
				const id = panelIdOf(child);
				const Component = child.options.component as ComponentType | undefined;
				const Pending = child.options.pendingComponent as ComponentType | undefined;
				const isPending = pendingRouteIds.includes(String(child.id));
				return (
					<Panel key={id} nav={id}>
						{isPending && Pending !== undefined ? (
							<Pending />
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
	return (
		<div style={{ paddingTop: 64, textAlign: "center" }}>
			<Spinner size="l" />
		</div>
	);
}
