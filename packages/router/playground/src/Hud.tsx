import { useRouterState } from "@tanstack/react-router";
import { app, router } from "./routes";

/**
 * PROTOTYPE observability: the full relevant navigation state,
 * re-rendered on every change (prototype rule: surface the state).
 */
export function Hud() {
	const pathname = useRouterState({ select: s => s.location.pathname });
	const index = useRouterState({
		select: s => (s.location.state as { __TSR_index?: number } | undefined)?.__TSR_index,
	});
	const itemPanelId = app.panels["main/item/$id"]!.routeId;
	const itemLoaded =
		router.routesById[itemPanelId as keyof typeof router.routesById] !== undefined &&
		(
			router.routesById[itemPanelId as keyof typeof router.routesById] as {
				options: { component?: unknown };
			}
		).options.component !== undefined;
	const modalInfo = useRouterState({
		select: s => {
			const ids = s.matches
				.map(
					m =>
						(
							router.routesById[m.routeId as keyof typeof router.routesById] as
								| { options: { staticData?: { modal?: string } } }
								| undefined
						)?.options.staticData?.modal,
				)
				.filter((id): id is string => id !== undefined);
			const global = (s.location.search as { modal?: string } | undefined)?.modal ?? null;
			return (
				[...ids, global ? `global:${global}` : null].filter(Boolean).join(", ") || "none"
			);
		},
	});

	return (
		<div
			style={{
				position: "fixed",
				zIndex: 100,
				right: 8,
				top: 8,
				maxWidth: 300,
				padding: "8px 10px",
				background: "rgba(20,20,20,0.85)",
				color: "#eee",
				fontFamily: "monospace",
				fontSize: 11,
				lineHeight: 1.5,
				borderRadius: 8,
				pointerEvents: "none",
			}}
		>
			<div style={{ color: "#7fd" }}>SPIKES: @vkma.dev/router playground</div>
			<div>path: {pathname}</div>
			<div>__TSR_index: {index ?? "null"}</div>
			<div>item lazy: {itemLoaded ? "loaded" : "pending"}</div>
			<div>modals: {modalInfo}</div>
		</div>
	);
}
