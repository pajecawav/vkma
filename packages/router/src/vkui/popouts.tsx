import { useRouter, useRouterState } from "@tanstack/react-router";
import { type ComponentType, type ReactNode } from "react";
import { POPOUT_STATE_KEY, readPopoutState } from "../core/state-keys.ts";

/**
 * Popouts are transient overlays, not routes: `history.state` holds
 * `{ popout: id, props }`, so the native/system back closes them, and
 * back/forward restores both the id and the props. Components come from
 * the registry (per-panel and/or global — see the preset builders);
 * `onClose` is injected by the host.
 */

export interface PopoutEntry {
	id: string;
	Component: ComponentType<{ onClose: () => void }>;
}

export function usePopoutState(): { id: string; props?: Record<string, unknown> } | undefined {
	return useRouterState({ select: state => readPopoutState(state.location.state) });
}

/** `showPopout(id, props)` — pushes a popout entry; replaces if one is open. */
export function useShowPopout(): (id: string, props?: Record<string, unknown>) => void {
	const router = useRouter();
	const isOpen = usePopoutState() !== undefined;
	return (id, props) => {
		void router.navigate({
			href: router.state.location.href,
			state: (previous: unknown) =>
				({
					...((previous ?? {}) as Record<string, unknown>),
					[POPOUT_STATE_KEY]: { id, props },
				}) as never,
			replace: isOpen,
		});
	};
}

/** `hidePopout()` — unwinds the popout entry; on the first entry, strips in place. */
export function useHidePopout(): () => void {
	const router = useRouter();
	return () => {
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
			state: state as never,
		});
	};
}

export function Popouts({
	entries,
	renderContainer,
}: {
	entries: PopoutEntry[];
	renderContainer?: (children: ReactNode) => ReactNode;
}) {
	const popout = usePopoutState();
	const hide = useHidePopout();
	if (popout === undefined) {
		return null;
	}
	const entry = entries.find(candidate => candidate.id === popout.id);
	if (!entry) {
		return null;
	}
	const content = <entry.Component onClose={hide} />;
	return renderContainer !== undefined ? renderContainer(content) : content;
}
