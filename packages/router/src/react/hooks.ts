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
 */
export function useLastWhileUndefined<T>(value: T | undefined): T | undefined {
	const ref = useRef(value);
	if (value !== undefined) {
		ref.current = value;
	}
	return value === undefined ? ref.current : value;
}

export function usePanelParams(from: string): Record<string, string> {
	const match = useMatch({ from, shouldThrow: false } as never);
	return (
		useLastWhileUndefined((match as { params?: Record<string, string> } | undefined)?.params) ??
		{}
	);
}

export function usePanelSearch<TSearch = Record<string, unknown>>(
	from: string,
): TSearch | undefined {
	const match = useMatch({ from, shouldThrow: false } as never);
	return useLastWhileUndefined((match as { search?: TSearch } | undefined)?.search);
}

export function usePanelLoaderData<TData>(from: string): TData | undefined {
	const match = useMatch({ from, shouldThrow: false } as never);
	return useLastWhileUndefined((match as { loaderData?: TData } | undefined)?.loaderData);
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
