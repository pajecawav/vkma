import { useRouter, useRouterState } from "@tanstack/react-router";
import { useCallback, type ComponentType } from "react";
import { looseRouteOf } from "../core/loose-route.ts";
import { POPOUT_STATE_KEY, readPopoutState } from "../core/state-keys.ts";

/**
 * Popouts are transient overlays, not routes: `history.state` holds
 * `{ popout: id, props }`, so the native/system back closes them, and
 * back/forward restores both the id and the props. Components come from
 * the registry (per-panel and/or global, see the preset builders);
 * `onClose` is injected by the host.
 */

export interface PopoutEntry {
	id: string;
	/**
	 * The popout component. `any` props on purpose: the host spreads the
	 * props stashed in history.state (`showPopout(id, props)`) and
	 * injects `onClose`; the typed surface is the preset's popout
	 * handles, which infer the props from the concrete signature.
	 */
	Component: ComponentType<any>;
	/**
	 * The owning panel key (`${view}/${panel}`) for a panel-local popout.
	 * It resolves only while that panel is the deepest matched one.
	 * Undefined = global (resolves from any panel).
	 */
	panel?: string;
}

export function usePopoutState(): { id: string; props?: Record<string, unknown> } | undefined {
	return useRouterState({ select: state => readPopoutState(state.location.state) });
}

/**
 * `showPopout(id, props)`. Pushes a popout entry; replaces if one is open.
 * Render-passive: the replace decision reads popout presence from the live
 * `router.state` at call time — the hook subscribes to nothing, and the
 * returned callback is stable.
 */
export function useShowPopout(): (id: string, props?: Record<string, unknown>) => void {
	const router = useRouter();
	return useCallback(
		(id: string, props?: Record<string, unknown>) => {
			void router.navigate({
				href: router.state.location.href,
				state: (previous: unknown) =>
					({
						...((previous ?? {}) as Record<string, unknown>),
						[POPOUT_STATE_KEY]: { id, props },
					}) as never,
				replace: readPopoutState(router.state.location.state) !== undefined,
			});
		},
		[router],
	);
}

/** `hidePopout()`. Unwinds the popout entry; on the first entry, strips in place. */
export function useHidePopout(): () => void {
	const router = useRouter();
	return useCallback(() => {
		if (router.history.canGoBack()) {
			router.history.back();
			return;
		}
		const state = {
			...(router.state.location.state as unknown as Record<string, unknown>),
		};
		delete state[POPOUT_STATE_KEY];
		void router.navigate({
			href: router.state.location.href,
			replace: true,
			state,
		});
	}, [router]);
}

/** The deepest matched panel's registry key (`${view}/${panel}`), or null. */
function useActivePanelKey(): string | null {
	const router = useRouter();
	return useRouterState({
		select: (state): string | null => {
			for (let i = state.matches.length - 1; i >= 0; i--) {
				const routeId = state.matches[i]?.routeId;
				if (routeId === undefined) {
					continue;
				}
				const panel = looseRouteOf(router, routeId)?.options.staticData?.panel;
				if (panel !== undefined) {
					return panel;
				}
			}
			return null;
		},
	});
}

export function Popouts({ entries }: { entries: PopoutEntry[] }) {
	const popout = usePopoutState();
	const hide = useHidePopout();
	const activePanelKey = useActivePanelKey();
	if (popout === undefined) {
		return null;
	}
	// resolution local → global: the current panel's own popouts shadow the
	// global registry
	const entry =
		entries.find(
			candidate =>
				candidate.panel !== undefined &&
				candidate.panel === activePanelKey &&
				candidate.id === popout.id,
		) ?? entries.find(candidate => candidate.panel === undefined && candidate.id === popout.id);
	if (!entry) {
		return null;
	}
	// the stashed props ride history.state (survive back/forward); onClose
	// is always injected last so a component cannot override it
	return <entry.Component {...popout.props} onClose={hide} />;
}
