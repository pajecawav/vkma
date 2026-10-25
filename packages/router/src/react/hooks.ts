import { useMatch, useRouterState } from "@tanstack/react-router";
import { useRef } from "react";
import {
	applyLocation,
	initialPanelsStack,
	type PanelsStackState,
	panelsHistoryOf,
} from "../core/panels-stack.ts";

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

export function usePanelParams<P extends Record<string, string>>(ref: PanelRef<P | undefined>): P;
export function usePanelParams(from: string): Record<string, string>;
export function usePanelParams(refOrFrom: PanelRef | string): unknown {
	const routeId = typeof refOrFrom === "string" ? refOrFrom : refOrFrom.routeId;
	const match = useMatch({ from: routeId, shouldThrow: false } as never);
	return useLastWhileUndefined((match as { params?: unknown } | undefined)?.params) ?? {};
}

export function usePanelSearch<S>(ref: PanelRef<any, S | undefined>): S | undefined;
export function usePanelSearch(from: string): Record<string, unknown>;
export function usePanelSearch(refOrFrom: PanelRef | string): unknown {
	const routeId = typeof refOrFrom === "string" ? refOrFrom : refOrFrom.routeId;
	const match = useMatch({ from: routeId, shouldThrow: false } as never);
	return useLastWhileUndefined((match as { search?: unknown } | undefined)?.search);
}

export function usePanelLoaderData<D>(ref: PanelRef<any, any, D | undefined>): D | undefined;
export function usePanelLoaderData(from: string): unknown;
export function usePanelLoaderData(refOrFrom: PanelRef | string): unknown {
	const routeId = typeof refOrFrom === "string" ? refOrFrom : refOrFrom.routeId;
	const match = useMatch({ from: routeId, shouldThrow: false } as never);
	return useLastWhileUndefined((match as { loaderData?: unknown } | undefined)?.loaderData);
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
