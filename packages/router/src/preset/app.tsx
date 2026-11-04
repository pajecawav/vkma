import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { looseRouteOf } from "../core/loose-route.ts";
import { Modals } from "../vkui/modals.tsx";
import { NotFound } from "../vkui/not-found.tsx";
import { Popouts } from "../vkui/popouts.tsx";
import { storyKeyOf, VkView } from "../vkui/vk-view.tsx";
import type { AppHandle } from "./builders.tsx";
import { deriveInflateChain, interpolatePath } from "./inflate.ts";

interface MatchLike {
	routeId?: string;
	status?: string;
	_notFound?: boolean;
}

/**
 * The view route owning the deepest matched route, or null. The walk starts
 * at the deepest match because the chain depth varies. A modal is a masked
 * CHILD route of its panel, so `/view:feed/feed/comments` must still resolve
 * to the feed view. A notFound match anywhere in the chain wins over
 * everything: the shell must show the NotFound screen, never a story
 * fallback (an unmatched lazy panel's chunk never loads, so a fallback
 * story would spin forever).
 */
export function owningViewIdOf(
	matches: readonly MatchLike[],
	views: readonly { id: string }[],
): string | null {
	const notFound = matches.some(
		match =>
			match.status === "notFound" || (match as { _notFound?: boolean })._notFound === true,
	);
	if (notFound) {
		return null;
	}
	for (let i = matches.length - 1; i >= 0; i--) {
		const routeId = matches[i]?.routeId ?? "";
		const view = views.find(view => routeId === view.id || routeId.startsWith(`${view.id}/`));
		if (view !== undefined) {
			return view.id;
		}
	}
	return null;
}

/**
 * Default root shell: the active view + the modal/popout hosts + inflate.
 * The active view is the one containing the deepest matched route
 * (single-view apps always get their only view). Multi-story apps with
 * Epic/Root are built with a custom `root` shell out of the same pieces.
 *
 * An unmatched URL (global 404 or a `notFound()` thrown by `beforeLoad`)
 * renders the VKUI `NotFound` instead of a view. Falling back to the
 * first view here would show its lazy panel as a spinner that never
 * resolves, because an unmatched panel's chunk is never loaded.
 */
export function AppRootShell({ app, inflate = true }: { app: AppHandle; inflate?: boolean }) {
	useInflate(app, inflate);
	const views = Object.values(app.views);

	const activeViewId = useRouterState({
		select: (state): string | null => owningViewIdOf(state.matches, views),
	});
	const activeView =
		activeViewId === null
			? undefined
			: Object.values(app.views).find(view => view.id === activeViewId);

	return (
		<>
			{activeView !== undefined ? <VkView view={activeView} /> : <NotFound />}
			<Modals entries={app.modals} />
			<Popouts entries={app.popouts} />
		</>
	);
}

/**
 * The active story key for Epic/Root shells: the view key the app author
 * wrote in `defineView("feed")`, or null on a notFound navigation. Render
 * the NotFound screen instead of a story. Pairs with `<VkView view={…}>`
 * whose nav defaults to the same key, so `activeStory === tab.id` compares
 * user-authored keys on both sides.
 */
export function useActiveStory(app: AppHandle): string | null {
	const views = Object.values(app.views);
	return useRouterState({
		select: (state): string | null => {
			const viewId = owningViewIdOf(state.matches, views);
			return viewId === null ? null : storyKeyOf(viewId);
		},
	});
}

/**
 * Inflate (spike parity): a cold start (first history entry) on a panel
 * that is NOT the first of its view replays the panel flow before it, so
 * back walks the natural chain instead of closing the app. One-shot, waits
 * for the router to go idle, skips warm navigations. `AppRootShell` runs
 * it automatically; custom shells (Epic/Tabbar) call the hook themselves.
 */
export function useInflate(app: AppHandle, enabled = true): void {
	const router = useRouter();
	const snapshot = useRouterState({
		select: state => {
			let panelKey: string | null = null;
			let panelPath: string | null = null;
			const modalPaths: string[] = [];
			for (let i = state.matches.length - 1; i >= 0; i--) {
				const routeId = state.matches[i]?.routeId;
				if (routeId === undefined) {
					continue;
				}
				const route = looseRouteOf(router, routeId);
				const staticData = route?.options.staticData;
				if (staticData?.modal !== undefined && route !== undefined) {
					// modal levels of the deep link, deepest first (reversed below)
					if (route.fullPath !== undefined) {
						modalPaths.push(route.fullPath);
					}
				}
				if (staticData?.panel !== undefined) {
					panelKey = staticData.panel;
					panelPath = route?.fullPath ?? null;
					break;
				}
			}
			return {
				status: state.status,
				index:
					(state.location.state as { __TSR_index?: number } | undefined)?.__TSR_index ??
					0,
				href: state.location.href,
				panelKey,
				panelPath,
				modalPaths: modalPaths.toReversed(),
				deepestParams:
					(
						state.matches[state.matches.length - 1] as
							| { params?: Record<string, string> }
							| undefined
					)?.params ?? {},
			};
		},
	});
	const done = useRef(false);

	useEffect(() => {
		if (done.current || !enabled || snapshot.status !== "idle") {
			return; // one-shot; retry until the router settles
		}
		done.current = true;
		if (snapshot.index > 0 || snapshot.panelKey === null) {
			return; // warm navigation or an unknown panel: nothing to inflate
		}
		const target = app.panels[snapshot.panelKey];
		if (target === undefined) {
			return;
		}
		const ordered = Object.values(app.panels).filter(panel => panel.viewId === target.viewId);
		let chain = deriveInflateChain(ordered, target.routeId, snapshot.deepestParams);
		// a deep link INTO A ROUTE MODAL: the full ancestor chain must sit in
		// history below the target (the parent panel, then every modal level,
		// outer → inner), or back skips the screens the user is logically
		// on. Only modal targets: for a panel target the parentHref IS the
		// current location and would replay a pointless no-op navigation
		if (snapshot.modalPaths.length > 0 && snapshot.panelPath !== null) {
			const parentHref = interpolatePath(snapshot.panelPath, snapshot.deepestParams);
			if (parentHref !== null && chain[chain.length - 1] !== parentHref) {
				chain = [...chain, parentHref];
			}
		}
		for (const modalPath of snapshot.modalPaths) {
			const modalHref = interpolatePath(modalPath, snapshot.deepestParams);
			if (modalHref !== null && chain[chain.length - 1] !== modalHref) {
				chain = [...chain, modalHref];
			}
		}
		if (chain.length === 0) {
			return;
		}
		const { href: targetHref } = snapshot;
		void (async () => {
			await router.navigate({ href: chain[0], replace: true });
			for (let i = 1; i < chain.length; i++) {
				await router.navigate({ href: chain[i] });
			}
			await router.navigate({ href: targetHref });
		})();
	});
}
