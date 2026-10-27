import {
	useNavigate,
	useRouter,
	useRouterState,
	type NavigateOptions,
} from "@tanstack/react-router";
import { looseRouteOf } from "../core/loose-route.ts";
import { MODAL_STATE_KEY } from "../core/state-keys.ts";
import { useHidePopout, useShowPopout } from "../vkui/popouts.tsx";

/**
 * The parity navigator over TanStack primitives: push/replace/back/
 * backToFirst/showModal/hideModal/showPopout/hidePopout. Modal→modal
 * navigation REPLACES the entry (the host closes one modal before opening
 * the next — there is no modal stack); back from a modal returns to its
 * panel. `push`/`replace`/`showModal` accept full TanStack NavigateOptions
 * — typed by the registered route tree.
 */

export interface VkNavigator {
	push(options: NavigateOptions): Promise<void>;
	replace(options: NavigateOptions): Promise<void>;
	back(): void;
	/** Pop all the way to the first history entry. */
	backToFirst(): void;
	/** Open a modal route; replaces the entry if another modal is open.
	 * `props` (serializable) land in history.state and are read by
	 * `useModalProps()` inside the modal component. */
	showModal(options: NavigateOptions & { props?: unknown }): Promise<void>;
	/** Close the current modal (back, or replace to the panel on first entry). */
	hideModal(): void;
	/**
	 * Open a global (`?modal=<id>`) modal from any panel, masking the URL so
	 * the visible path stays at the panel. Back closes it.
	 */
	showGlobalModal(
		id: string,
		options?: { state?: Record<string, unknown>; props?: unknown },
	): Promise<void>;
	showPopout(id: string, props?: Record<string, unknown>): void;
	hidePopout(): void;
	/**
	 * Block navigation while `onLeave` returns true (old router's
	 * `RouteNavigator.block`). Returns the unblock function.
	 */
	block(onLeave: (args: { action: string }) => boolean): () => void;
}

function isModalRouteId(router: ReturnType<typeof useRouter>, routeId: string): boolean {
	return looseRouteOf(router, routeId)?.options.staticData?.modal !== undefined;
}

export function useNavigator(): VkNavigator {
	const router = useRouter();
	const navigate = useNavigate();
	const location = useRouterState({ select: state => state.location });
	const modalOpen = useRouterState({
		select: state => state.matches.some(match => isModalRouteId(router, match.routeId)),
	});
	const showPopout = useShowPopout();
	const hidePopout = useHidePopout();

	return {
		push: options => navigate({ ...options, replace: false }) as Promise<void>,
		replace: options => navigate({ ...options, replace: true }) as Promise<void>,
		back: () => {
			router.history.back();
		},
		backToFirst: () => {
			const index =
				(location.state as { __TSR_index?: number } | undefined)?.__TSR_index ?? 0;
			if (index > 0) {
				router.history.go(-index);
			}
		},
		showModal: ({ props, ...options }) => {
			// nested modal: the target route is a CHILD of the currently open
			// modal — PUSH (back unwinds the stack); sibling modals keep the
			// old-router replace parity
			let nested = false;
			if (modalOpen && typeof options.to === "string") {
				for (let i = router.state.matches.length - 1; i >= 0; i--) {
					const matchRouteId = router.state.matches[i]?.routeId;
					if (matchRouteId === undefined) {
						continue;
					}
					const route = looseRouteOf(router, matchRouteId);
					if (route?.options.staticData?.modal === undefined) {
						continue;
					}
					nested =
						route.fullPath !== undefined && options.to.startsWith(`${route.fullPath}/`);
					break;
				}
			}
			// TanStack types history state as its own updater shape — arbitrary
			// serializable keys go through a cast (same as the popout state)
			const withProps =
				props !== undefined
					? {
							state: {
								...(options.state as Record<string, unknown> | undefined),
								[MODAL_STATE_KEY]: { props },
							} as never,
						}
					: {};
			return navigate({
				...options,
				// a modal open never changes the panel behind it — carry the
				// panel's search (?tab=…) onto the modal entry, or the covered
				// panel would snap to its default search for the whole time the
				// modal is open (and snap back on close). An explicit `search`
				// from the caller always wins.
				search: options.search ?? true,
				replace: nested ? false : modalOpen,
				...withProps,
			}) as Promise<void>;
		},
		hideModal: () => {
			if (router.history.canGoBack()) {
				router.history.back();
				return;
			}
			// deep-linked modal on the first entry: replace down to the panel
			const parentPath = location.pathname.replace(/\/[^/]+$/, "") || "/";
			void router.navigate({ href: parentPath, replace: true });
		},
		showPopout: (id, props) => {
			showPopout(id, props);
		},
		hidePopout: () => {
			hidePopout();
		},
		showGlobalModal: (id, { state, props, ...rest } = {}) => {
			const { pathname, searchStr, hash } = router.state.location;
			const params = new URLSearchParams(searchStr.replace(/^\?/, ""));
			const already = params.get("modal") === id;
			params.set("modal", id);
			const href = `${pathname}?${params.toString()}${hash}`;
			// the mask keeps the visible URL at the panel path while the modal
			// is open (the modal param rides in history.state)
			const maskParams = new URLSearchParams(params);
			maskParams.delete("modal");
			const maskQuery = maskParams.toString();
			const maskHref = `${pathname}${maskQuery !== "" ? `?${maskQuery}` : ""}${hash}`;
			const nextState =
				state !== undefined || props !== undefined
					? {
							state: {
								...state,
								...(props !== undefined ? { [MODAL_STATE_KEY]: { props } } : {}),
							} as never,
						}
					: {};
			return navigate({
				href,
				mask: { to: maskHref },
				replace: already || modalOpen,
				...rest,
				...nextState,
			}) as Promise<void>;
		},
		block: onLeave => {
			const unblock = router.history.block({
				blockerFn: () => onLeave({ action: "PUSH" }),
			} as never);
			return unblock;
		},
	};
}
