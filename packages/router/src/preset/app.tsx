import { useRouterState } from "@tanstack/react-router";
import { Modals } from "../vkui/modals.tsx";
import { Popouts } from "../vkui/popouts.tsx";
import { VkView } from "../vkui/vk-view.tsx";
import type { AppHandle } from "./builders.tsx";

/**
 * Default root shell: the active view + the modal/popout hosts. The active
 * view is the one containing the deepest matched route (single-view apps
 * always get their only view). Multi-story apps with Epic/Root are built
 * with a custom `root` shell out of the same pieces.
 */
export function AppRootShell({ app }: { app: AppHandle }) {
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
