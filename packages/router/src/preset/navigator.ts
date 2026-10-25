import {
	useNavigate,
	useRouter,
	useRouterState,
	type NavigateOptions,
} from "@tanstack/react-router";
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
	/** Open a modal route; replaces the entry if another modal is open. */
	showModal(options: NavigateOptions): Promise<void>;
	/** Close the current modal (back, or replace to the panel on first entry). */
	hideModal(): void;
	/**
	 * Open a global (`?modal=<id>`) modal from any panel, masking the URL so
	 * the visible path stays at the panel. Back closes it.
	 */
	showGlobalModal(id: string, options?: { state?: Record<string, unknown> }): Promise<void>;
	showPopout(id: string, props?: Record<string, unknown>): void;
	hidePopout(): void;
	/**
	 * Block navigation while `onLeave` returns true (old router's
	 * `RouteNavigator.block`). Returns the unblock function.
	 */
	block(onLeave: (args: { action: string }) => boolean): () => void;
}

function isModalRouteId(router: ReturnType<typeof useRouter>, routeId: string): boolean {
	const route = (
		router.routesById as Record<string, { options: { staticData?: { modal?: string } } }>
	)[routeId];
	return route?.options.staticData?.modal !== undefined;
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
		showModal: options => navigate({ ...options, replace: modalOpen }) as Promise<void>,
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
		showGlobalModal: (id, options) => {
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
			return navigate({
				href,
				mask: { to: maskHref },
				replace: already || modalOpen,
				...(options as Record<string, unknown> | undefined),
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
