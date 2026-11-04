import { useNavigate, useRouter, type NavigateOptions } from "@tanstack/react-router";
import { useMemo } from "react";
import { looseRouteOf } from "../core/loose-route.ts";
import { MODAL_STATE_KEY } from "../core/state-keys.ts";
import { useHidePopout, useShowPopout } from "../vkui/popouts.tsx";

/**
 * The parity navigator over TanStack primitives: push/replace/back/
 * backToFirst/showModal/hideModal/showPopout/hidePopout. Modal→modal
 * navigation REPLACES the entry (the host closes one modal before opening
 * the next. There is no modal stack); back from a modal returns to its
 * panel. `push`/`replace`/`showModal` accept full TanStack NavigateOptions,
 * typed by the registered route tree.
 */

export interface VkNavigator {
	push<TParams extends Record<string, string>>(
		page: PanelPage<TParams>,
		params: TParams,
		options?: Omit<NavigateOptions, "to" | "params">,
	): Promise<void>;
	push(options: NavigateOptions): Promise<void>;
	replace<TParams extends Record<string, string>>(
		page: PanelPage<TParams>,
		params: TParams,
		options?: Omit<NavigateOptions, "to" | "params">,
	): Promise<void>;
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
	 * `RouteNavigator.block`). The callback receives the current and the
	 * next location plus the action: PUSH/REPLACE as-is, back/forward/go
	 * mapped to POP (old-router `BlockerFunction` parity). Returns the
	 * unblock function.
	 */
	block(onLeave: (args: BlockerArgs) => boolean): () => void;
}

function isModalRouteId(router: ReturnType<typeof useRouter>, routeId: string): boolean {
	return looseRouteOf(router, routeId)?.options.staticData?.modal !== undefined;
}

export interface BlockerArgs {
	/** The location the navigation starts from (TanStack history location). */
	currentLocation: { href: string; pathname: string };
	/** The location the navigation is heading to. */
	nextLocation: { href: string; pathname: string };
	/** PUSH/REPLACE as-is; back, forward and go are one POP (old-router parity). */
	action: "PUSH" | "REPLACE" | "POP";
}

/**
 * A typed page object, a panel definition (`defineView().panel(...)`) or
 * a panel handle (`app.panels[...]`). The params type flows from the
 * definition's phantom `types`, so `navigator.push(postPanel, { id })`
 * type-checks the params (old-router `Page`/`PageWithParams` parity,
 * without the `hasParams` discriminator quirk).
 */
export interface PanelPage<TParams = Record<string, string>> {
	path: string;
	types?: { params: TParams };
}

/** `"index"` and an optional leading slash normalize to the full path. */
const pageTo = (page: PanelPage): string =>
	page.path === "index" ? "/" : `/${page.path.replace(/^\//, "")}`;

/**
 * The one navigator. Render-passive: it subscribes to no router state —
 * the location, modal and popout presence it needs are read from the live
 * `router.state` at call time — so using the hook triggers no re-renders,
 * and the returned `VkNavigator` object has a stable identity.
 */
export function useNavigator(): VkNavigator {
	const router = useRouter();
	const navigate = useNavigate();
	const showPopout = useShowPopout();
	const hidePopout = useHidePopout();

	return useMemo(() => {
		// call-time modal visibility: the hook carries no router-state
		// subscription (matches between renders change only by navigation)
		const anyModalOpen = () =>
			router.state.matches.some(match => isModalRouteId(router, match.routeId));

		return {
			push: ((
				pageOrOptions: NavigateOptions | PanelPage,
				params?: Record<string, string>,
				rest?: Omit<NavigateOptions, "to" | "params">,
			) =>
				params === undefined
					? navigate({
							...(pageOrOptions as NavigateOptions),
							replace: false,
						})
					: navigate({
							to: pageTo(pageOrOptions as PanelPage),
							params,
							replace: false,
							...rest,
						})) as VkNavigator["push"],
			replace: ((
				pageOrOptions: NavigateOptions | PanelPage,
				params?: Record<string, string>,
				rest?: Omit<NavigateOptions, "to" | "params">,
			) =>
				params === undefined
					? navigate({
							...(pageOrOptions as NavigateOptions),
							replace: true,
						})
					: navigate({
							to: pageTo(pageOrOptions as PanelPage),
							params,
							replace: true,
							...rest,
						})) as VkNavigator["replace"],
			back: () => {
				router.history.back();
			},
			backToFirst: () => {
				// the entry stamp is read at call time: no location subscription
				const state = router.state.location.state as { __TSR_index?: number } | undefined;
				const index = state?.__TSR_index ?? 0;
				if (index > 0) {
					router.history.go(-index);
				}
			},
			showModal: ({ props, ...options }) => {
				const modalOpen = anyModalOpen();
				// nested modal: the target route is a CHILD of the currently open
				// modal: PUSH (back unwinds the stack); sibling modals keep the
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
							route.fullPath !== undefined &&
							options.to.startsWith(`${route.fullPath}/`);
						break;
					}
				}
				// TanStack types history state as its own updater shape. Arbitrary
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
					// a modal open never changes the panel behind it. Carry the
					// panel's search (?tab=…) onto the modal entry, or the covered
					// panel would snap to its default search for the whole time the
					// modal is open (and snap back on close). An explicit `search`
					// from the caller always wins.
					search: options.search ?? true,
					replace: nested ? false : modalOpen,
					...withProps,
				});
			},
			hideModal: () => {
				if (router.history.canGoBack()) {
					router.history.back();
					return;
				}
				// deep-linked modal on the first entry: replace down to the panel
				const parentPath = router.state.location.pathname.replace(/\/[^/]+$/, "") || "/";
				void router.navigate({ href: parentPath, replace: true });
			},
			showPopout,
			hidePopout,
			showGlobalModal: (id, { state, props, ...rest } = {}) => {
				const modalOpen = anyModalOpen();
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
									...(props !== undefined
										? { [MODAL_STATE_KEY]: { props } }
										: {}),
								} as never,
							}
						: {};
				return navigate({
					href,
					mask: { to: maskHref },
					replace: already || modalOpen,
					...rest,
					...nextState,
				});
			},
			block: onLeave => {
				const unblock = router.history.block({
					// args infer as TanStack's BlockerFnArgs (HistoryLocation × 2 +
					// action), assignable to our structural BlockerArgs
					blockerFn: args =>
						onLeave({
							currentLocation: args.currentLocation,
							nextLocation: args.nextLocation,
							// TanStack distinguishes BACK/FORWARD/GO; the old router's
							// BlockerFunction saw one POP. Keep the parity
							action:
								args.action === "PUSH" || args.action === "REPLACE"
									? args.action
									: "POP",
						}),
				});
				return unblock;
			},
		};
	}, [router, navigate, showPopout, hidePopout]);
}
