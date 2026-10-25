import { type AnyRoute, useParams, useRouterState } from "@tanstack/react-router";
import { Panel, Spinner, View } from "@vkontakte/vkui";
import { type ComponentType, useEffect, useRef } from "react";
import {
	applyLocation,
	initialPanelsStack,
	type PanelsStackState,
	panelsHistoryOf,
} from "./panelsStack";

/**
 * PROTOTYPE (spike 1) — the piece that may lift into @vkma.dev/router/vkui.
 *
 * The static-children model: every panel route of the view renders as an
 * always-present JSX child of VKUI <View>; the router only feeds
 * `activePanel` (+ `history` for the iOS swipe-back). VKUI then hides the
 * inactive panels itself and infers the animation direction from the JSX
 * order — a plain <Outlet> would break both.
 */

interface PanelStaticData {
	panel: string;
}

function panelIdOf(route: AnyRoute): string {
	return (route.options.staticData as PanelStaticData | undefined)?.panel ?? "";
}

export function usePanelRouteMatches(route: AnyRoute) {
	return useRouterState({
		select: state => {
			// deepest match inside this view that is one of its panel routes
			const childIds = new Set(route.children.map((child: AnyRoute) => child.id));
			const leaf = [...state.matches].reverse().find(match => childIds.has(match.routeId));
			return leaf?.routeId ?? route.children[0]?.id ?? "";
		},
	});
}

/** Mirror of the history stack in panel ids, driven by `__TSR_index`.
 * Applies only when the router is idle — between the location commit and
 * the match resolution there is an intermediate render with a stale
 * activePanel (observed: `[home, home]` flash, self-healed by the
 * replace-on-same-index rule). */
function usePanelsStack(activePanel: string): PanelsStackState {
	const snapshot = useRouterState({
		select: state => ({
			status: state.status,
			index:
				(state.location.state as { __TSR_index?: number } | undefined)?.__TSR_index ?? null,
		}),
	});
	const ref = useRef<PanelsStackState>(initialPanelsStack());

	if (snapshot.status === "idle") {
		ref.current = applyLocation(ref.current, snapshot.index, activePanel);
	}

	return ref.current;
}

/**
 * Spike-1 fix for the departing-panel crash: raw `useParams({ from })` throws
 * `Invariant failed: Could not find an active match` when the panel's route
 * stops matching while VKUI still keeps the panel mounted during the back
 * animation (crash → CatchBoundary remounts the whole tree). The /vkui layer
 * will ship its own data hooks with this semantics: never throw + retain the
 * last resolved value while the panel is mounted but not matched.
 */
export function useLastWhileUndefined<T>(value: T | undefined): T | undefined {
	const ref = useRef(value);
	if (value !== undefined) {
		ref.current = value;
	}
	return value === undefined ? ref.current : value;
}

export function usePanelParams(from: string): Record<string, string> {
	const params = useParams({ from: from as never, shouldThrow: false });
	return useLastWhileUndefined(params as Record<string, string> | undefined) ?? {};
}

export function VkuiView({ route }: { route: AnyRoute }) {
	const activeRouteId = usePanelRouteMatches(route);
	const activeChild =
		route.children.find((child: AnyRoute) => child.id === activeRouteId) ?? route.children[0];
	const activePanel = activeChild ? panelIdOf(activeChild) : "";

	const mirror = usePanelsStack(activePanel);
	const history = panelsHistoryOf(mirror);

	// PROTOTYPE observability: log every state change for the spike notes.
	useEffect(() => {
		console.log(
			"[spike] active=%s index=%d mirror=%j vkuiHistory=%j",
			activePanel,
			mirror.cursor,
			mirror.entries.slice(0, mirror.cursor + 1),
			history,
		);
	});

	return (
		<View activePanel={activePanel} history={history} onSwipeBack={() => window.history.back()}>
			{route.children.map((child: AnyRoute) => {
				const id = panelIdOf(child);
				// For a lazy route `options.component` is undefined until the
				// chunk resolves (TanStack merges loaded options in place).
				const Component = child.options.component as ComponentType | undefined;
				return (
					<Panel key={id} nav={id}>
						{Component ? (
							<Component />
						) : (
							<div style={{ paddingTop: 64 }}>
								<Spinner size="l" />
							</div>
						)}
					</Panel>
				);
			})}
		</View>
	);
}
