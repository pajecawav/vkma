import { useMatch, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { looseRouteOf } from "../core/loose-route.ts";
import {
	applyLocation,
	initialPanelsStack,
	type PanelsStackState,
	panelsHistoryOf,
} from "../core/panels-stack.ts";
import { readModalState } from "../core/state-keys.ts";
import { setSwipeBackOverride } from "../core/swipe-back.ts";

/**
 * The departing-panel freeze (spike 1): raw TanStack data hooks throw
 * `Invariant failed: Could not find an active match` when the panel's
 * route stops matching while VKUI still keeps the panel mounted during the
 * back animation — the error flies past the router's error boundary and
 * remounts the whole tree. These hooks never throw and retain the last
 * resolved value while the panel is mounted but unmatched.
 *
 * Pass the TYPED panel handle (`app.panels["feed/post/$id"]`) — params /
 * search / loaderData are derived from the panel's declared options
 * (validateSearch return, loader return, $param path segments). A plain
 * route-id string also works, with loose types.
 */

/**
 * Structural twin of the preset's `PanelHandle` — the phantom `types`
 * member carries the panel's data types without coupling this layer to
 * the preset.
 */
export interface PanelRef<
	TParams = Record<string, string>,
	TSearch = Record<string, unknown>,
	TLoaderData = unknown,
> {
	readonly routeId: string;
	readonly types?: { params: TParams; search: TSearch; loaderData: TLoaderData };
}

export function useLastWhileUndefined<T>(value: T | undefined): T | undefined {
	const ref = useRef(value);
	if (value !== undefined) {
		ref.current = value;
	}
	return value === undefined ? ref.current : value;
}

/** Shared body of the panel data hooks — they differ only in the match field. */
function usePanelMatchField(
	refOrFrom: PanelRef | string,
	field: "params" | "search" | "loaderData",
): unknown {
	const routeId = typeof refOrFrom === "string" ? refOrFrom : refOrFrom.routeId;
	const match = useMatch({ from: routeId, shouldThrow: false } as never);
	return useLastWhileUndefined(
		(match as unknown as Record<string, unknown> | undefined)?.[field],
	);
}

export function usePanelParams<P extends Record<string, string>>(
	ref: PanelRef<P | undefined, any, any>,
): P;
export function usePanelParams(from: string): Record<string, string>;
export function usePanelParams(refOrFrom: PanelRef | string): unknown {
	return usePanelMatchField(refOrFrom, "params") ?? {};
}

export function usePanelSearch<S>(ref: PanelRef<any, S | undefined, any>): S | undefined;
export function usePanelSearch(from: string): Record<string, unknown>;
export function usePanelSearch(refOrFrom: PanelRef | string): unknown {
	return usePanelMatchField(refOrFrom, "search");
}

export function usePanelLoaderData<D>(ref: PanelRef<any, any, D | undefined>): D | undefined;
export function usePanelLoaderData(from: string): unknown;
export function usePanelLoaderData(refOrFrom: PanelRef | string): unknown {
	return usePanelMatchField(refOrFrom, "loaderData");
}

/**
 * Runtime props of the open modal — `showModal({ to, params, props })` /
 * `showGlobalModal(id, { props })` stash them in `history.state` (so they
 * survive reload and back/forward) and the modal entry component reads them
 * here. Serializable values only (structured clone); same freeze semantics
 * as the panel hooks — the departing modal keeps its last props while it
 * animates out.
 */
export function useModalProps<T = unknown>(): T | undefined {
	const modal = useRouterState({ select: state => readModalState(state.location.state) });
	return useLastWhileUndefined(modal?.props) as T | undefined;
}

/**
 * Mirror of the history stack in panel ids, driven by `__TSR_index`.
 * Applies only when the router is idle — between the location commit and
 * the match resolution there is an intermediate render with a stale
 * activePanel (spike 1: `[home, home]` flash, self-healed by the
 * replace-on-same-index rule).
 */
export function usePanelsStack(activePanel: string): PanelsStackState {
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

/** VKUI `View.history` prop: panels in open order. */
export function usePanelsHistory(activePanel: string): string[] {
	return panelsHistoryOf(usePanelsStack(activePanel));
}

/**
 * The deepest matched panel's route id — what "the active panel" means
 * when every panel is a permanently mounted static child.
 */
function useActivePanelRouteId(): string | null {
	const router = useRouter();
	return useRouterState({
		select: (state): string | null => {
			for (let i = state.matches.length - 1; i >= 0; i--) {
				const routeId = state.matches[i]?.routeId;
				if (routeId === undefined) {
					continue;
				}
				if (looseRouteOf(router, routeId)?.options.staticData?.panel !== undefined) {
					return routeId;
				}
			}
			return null;
		},
	});
}

/**
 * The old router's `useEnableSwipeBack`: override the automatic
 * swipe-back decision while it applies. Panels are permanently mounted
 * static children here, so pass the panel ref — the override applies only
 * while that panel is the deepest matched one and is released when the
 * user navigates away. Without a ref the override is app-global.
 *
 * `false` turns the native gesture off (drawing pads, drag surfaces);
 * `true` forces it on even on the first entry (the system back then
 * closes the app — you asked for it). `createSwipeBackManager({
 * enabled: false })` is the hard opt-out that wins over this hook.
 */
export function useEnableSwipeBack(enabled: boolean, ref?: PanelRef | string): void {
	const activeRouteId = useActivePanelRouteId();
	const routeId = typeof ref === "string" ? ref : ref?.routeId;
	const applies = ref === undefined ? true : routeId !== undefined && routeId === activeRouteId;
	useEffect(() => {
		if (!applies) {
			return;
		}
		setSwipeBackOverride(enabled);
		return () => setSwipeBackOverride(null);
	}, [applies, enabled]);
}
