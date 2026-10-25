import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { Modals } from "../vkui/modals.tsx";
import { Popouts } from "../vkui/popouts.tsx";
import { VkView } from "../vkui/vk-view.tsx";
import type { AppHandle } from "./builders.tsx";
import { deriveInflateChain } from "./inflate.ts";

/**
 * Default root shell: the active view + the modal/popout hosts + inflate.
 * The active view is the one containing the deepest matched route
 * (single-view apps always get their only view). Multi-story apps with
 * Epic/Root are built with a custom `root` shell out of the same pieces.
 */
export function AppRootShell({ app, inflate = true }: { app: AppHandle; inflate?: boolean }) {
	useInflate(app, inflate);

	const activeViewId = useRouterState({
		select: state => {
			const views = Object.values(app.views);
			for (let i = state.matches.length - 1; i >= 0; i--) {
				const routeId = state.matches[i]?.routeId ?? "";
				const view = views.find(
					view => routeId === view.id || routeId.startsWith(`${view.id}/`),
				);
				if (view !== undefined) {
					return view.id;
				}
			}
			return views[0]?.id ?? "";
		},
	});
	const activeView =
		Object.values(app.views).find(view => view.id === activeViewId) ??
		Object.values(app.views)[0];

	return (
		<>
			{activeView !== undefined ? <VkView view={activeView} /> : null}
			<Modals entries={app.modals} />
			<Popouts entries={app.popouts} />
		</>
	);
}

/**
 * Inflate (spike parity): a cold start (first history entry) on a panel
 * that is NOT the first of its view replays the panel flow before it, so
 * back walks the natural chain instead of closing the app. One-shot, waits
 * for the router to go idle, skips warm navigations.
 */
function useInflate(app: AppHandle, enabled: boolean): void {
	const router = useRouter();
	const snapshot = useRouterState({
		select: state => {
			let panelKey: string | null = null;
			for (let i = state.matches.length - 1; i >= 0; i--) {
				const routeId = state.matches[i]?.routeId;
				if (routeId === undefined) {
					continue;
				}
				const route = (
					router.routesById as Record<
						string,
						{ options: { staticData?: { panel?: string } } }
					>
				)[routeId];
				const panel = route?.options.staticData?.panel;
				if (panel !== undefined) {
					panelKey = panel;
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
			return; // warm navigation or an unknown panel — nothing to inflate
		}
		const target = app.panels[snapshot.panelKey];
		if (target === undefined) {
			return;
		}
		const ordered = Object.values(app.panels).filter(panel => panel.viewId === target.viewId);
		const chain = deriveInflateChain(ordered, target.routeId, snapshot.deepestParams);
		if (chain.length === 0) {
			return;
		}
		const { href: targetHref } = snapshot;
		void (async () => {
			await router.navigate({ href: chain[0] as string, replace: true });
			for (let i = 1; i < chain.length; i++) {
				await router.navigate({ href: chain[i] as string });
			}
			await router.navigate({ href: targetHref });
		})();
	});
}
