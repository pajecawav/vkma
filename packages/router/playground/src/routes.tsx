import { createRouter, redirect } from "@tanstack/react-router";
import { AppRootShell, NotFound, createApp, createVkHistory } from "@vkma.dev/router/preset";
import { usePanelParams } from "@vkma.dev/router/react";
import { Alert } from "@vkontakte/vkui";
import { HostControls } from "./HostControls";
import { Hud } from "./Hud";
import { AboutPanel, FeedPanel, FeedPending, HomePanel, ListPanel } from "./panels";

/**
 * The playground consumes @vkma.dev/router — this IS the integration check
 * of the package (the spikes live in git history and DESIGN.md verdicts).
 */

function DetailsModal() {
	const { id = "?" } = usePanelParams(app.panels["main/item/$id"]!.routeId);
	return (
		<div style={{ padding: 20 }}>
			<h2 style={{ margin: "0 0 8px" }}>Details</h2>
			<p style={{ margin: "0 0 16px", color: "#666" }}>details for item {id}</p>
			<button
				type="button"
				onClick={() =>
					void router.navigate({
						to: "/item/$id/more",
						params: { id },
						replace: true,
					})
				}
			>
				open more (modal on modal, sequential)
			</button>
		</div>
	);
}

function MoreModal() {
	return (
		<div style={{ padding: 20 }}>
			<h2 style={{ margin: "0 0 8px" }}>More</h2>
			<p style={{ margin: 0, color: "#666" }}>
				second-level modal: the first one closed with animation before this one opened
			</p>
		</div>
	);
}

function SettingsModal() {
	return (
		<div style={{ padding: 20 }}>
			<h2 style={{ margin: "0 0 8px" }}>Settings</h2>
			<p style={{ margin: 0, color: "#666" }}>
				global modal via ?modal=settings — opened from any panel
			</p>
		</div>
	);
}

export const app = createApp({
	root: () => (
		<>
			<AppRootShell app={app} />
			<Hud />
			<HostControls />
		</>
	),
	views: {
		main: {
			panels: {
				index: { component: HomePanel },
				list: { component: ListPanel },
				"item/$id": {
					lazy: routeId => import("./panels/item.lazy").then(m => m.itemLazy(routeId)),
					validateSearch: (search: { tab?: string }): { tab?: string } => ({
						tab: search.tab,
					}),
					beforeLoad: ({ params }: { params: { id: string } }) => {
						if (params.id === "666") {
							throw redirect({ to: "/" });
						}
					},
					modals: { details: DetailsModal, more: MoreModal },
				},
				feed: {
					loader: async () => {
						await new Promise(resolve => setTimeout(resolve, 700));
						return { items: ["alpha", "beta", "gamma"] };
					},
					pendingComponent: FeedPending,
					component: FeedPanel,
				},
				about: { component: AboutPanel },
			},
		},
	},
	modals: { settings: SettingsModal },
	popouts: { confirm: ConfirmLeave },
});

function ConfirmLeave({ onClose }: { onClose: () => void }) {
	return (
		<Alert
			title="Выйти без сохранения?"
			description="Изменения не сохранятся."
			actions={[
				{ title: "Остаться", mode: "cancel", action: onClose },
				{ title: "Выйти", mode: "destructive", action: onClose },
			]}
			onClose={onClose}
			onClosed={onClose}
		/>
	);
}

export const router = createRouter({
	routeTree: app.routeTree,
	history: createVkHistory().history,
	defaultNotFoundComponent: NotFound,
});

declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}
