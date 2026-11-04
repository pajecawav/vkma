import type { AnyRoute } from "@tanstack/react-router";
import { useRouterState } from "@tanstack/react-router";
import { Panel, PanelHeader, PanelSpinner, View } from "@vkontakte/vkui";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";
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
 * the animation direction from the children order. A plain <Outlet>
 * breaks both. A lazy panel's `options.component` is undefined until its
 * chunk resolves (TanStack merges loaded options in place), so the panel
 * renders a spinner fallback until then, but only after a short grace
 * delay: a fast chunk load resolves within a frame or two, so the panel
 * shows nothing meanwhile and paints once the chunk arrives. For the same
 * reason TanStack's Outlet-driven `pendingComponent` swap never happens
 * on its own: while the panel's match is pending (loader/beforeLoad),
 * the route's `pendingComponent` renders instead of the component.
 */
export function VkView({ view, nav, onSwipeBack }: VkViewProps) {
	useMatchSummaries();
	const matchedRouteIds = useRouterState({
		select: state => state.matches.map(match => match.routeId),
	});
	// structurally-compared array. TanStack keeps the reference stable when
	// the selection is deep-equal. TanStack's Outlet would swap in the
	// route's pendingComponent itself, but static children render the
	// component directly, so the swap is ours to make while the loader runs
	const pendingRouteIds = useRouterState({
		select: state =>
			state.matches
				.filter(match => (match as { status?: string }).status === "pending")
				.map(match => String(match.routeId)),
	});
	// The grace delay: a pending match only earns the spinner fallback after
	// staying pending for this long. Fast lazy-chunk loads (a warm cache, a
	// small bundle) resolve within a frame or two. Flashing a spinner for
	// that blink makes every navigation feel broken. Showing nothing keeps
	// the previous paint on screen until the new panel mounts, so nothing
	// swaps mid-frame. Real loaders outlive the delay and still get the
	// fallback.
	const stalledRouteIds = useStalledIds(pendingRouteIds, 200);
	// a notFound match (notFound() from beforeLoad/validateSearch) must NOT
	// render its panel component: the component's data guards assume a valid
	// match, and the shell renders the NotFound screen for this navigation.
	// The panel itself stays invisible. Without the gate the component would
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
				// the grace-gated pending set (useStalledIds): a fast chunk load
				// resolves inside the grace window, the panel keeps painting and
				// the arriving component mounts without a spinner flash
				const isPending = stalledRouteIds.includes(String(child.id));
				const isNotFound = notFoundRouteIds.includes(String(child.id));
				// A LOADED COMPONENT ALWAYS WINS, even while its match is still
				// pending. The fallback may only appear when the component is
				// genuinely absent (chunk not merged yet): replacing rendered
				// content with a spinner after it already appeared reads as
				// broken. (Panels reading route data through the /react hooks
				// are safe to render in a transient pending render; raw
				// TanStack data hooks are not. See the AGENTS invariants.)
				let content: ReactNode;
				if (isNotFound) {
					// parked on a notFound boundary up the tree. The component's
					// data guards assume a resolvable match and would throw in a
					// hidden panel; the shell renders the NotFound screen anyway
					content = null;
				} else if (Component !== undefined) {
					// A LOADED COMPONENT ALWAYS WINS, even while its match is
					// still pending. The fallback may only appear when the
					// component is genuinely absent (chunk not merged yet):
					// replacing rendered content with a spinner after it already
					// appeared reads as broken. (Panels reading route data
					// through the /react hooks are safe to render in a transient
					// pending render; raw TanStack data hooks are not. See the
					// AGENTS invariants.)
					content = <Component />;
				} else if (isPending && Pending !== undefined) {
					// an explicit pendingComponent is deliberate. No grace delay
					content = <Pending />;
				} else if (isPending) {
					content = <DefaultPanelPendingComponent />;
				} else {
					// chunk in flight, inside the grace window: a header stub beats
					// a spinner that would flash for a blink, and beats an empty
					// panel: every panel SEPARATES with its own <PanelHeader>, so
					// the stub paints the final layout slot and the arriving
					// content fills in under it, nothing jumps
					content = <PanelHeader />;
				}
				return (
					<Panel key={id} nav={id}>
						{content}
					</Panel>
				);
			})}
		</View>
	);
}

/**
 * The canonical pending screen for a panel: a header stub keeps the layout
 * structure while the lazy chunk is in flight, and PanelSpinner centers
 * itself inside the panel (a bare Spinner floats at the top of a void).
 *
 * `VkView` renders this whenever a chunk is genuinely absent past the grace
 * delay (see the pending branches in the render above); pass it as a
 * panel's `pendingComponent` to opt out of the grace delay instead.
 */
export function DefaultPanelPendingComponent() {
	return (
		<>
			<PanelHeader />
			<PanelSpinner size="l" />
		</>
	);
}

/**
 * The delayed-spinner gate: mirrors `pendingIds` but only after they have
 * stayed pending for `delayMs` continuously; clears the moment the pending
 * set empties. The state is a STRING KEY, not the array. Array-typed state
 * set from an effect re-triggers renders (a fresh reference every time)
 * and loops; a key string with the React bail-out (same value → no
 * re-render) cannot. `key` is stable across re-renders as long as the
 * pending SET is the same, even if TanStack hands out a fresh array
 * reference per render.
 */
function useStalledIds(pendingIds: string[], delayMs: number): string[] {
	const key = pendingIds.join("|");
	const [stalledKey, setStalledKey] = useState("");
	useEffect(() => {
		if (key === "") {
			// functional reset so the bail-out keeps "" → "" render-free
			// (see the overview comment above)
			// eslint-disable-next-line react/set-state-in-effect
			setStalledKey(prev => (prev === "" ? prev : ""));
			return;
		}
		const timer = setTimeout(() => setStalledKey(key), delayMs);
		return () => {
			clearTimeout(timer);
		};
	}, [key, delayMs]);
	return stalledKey === key && key !== "" ? pendingIds : [];
}
