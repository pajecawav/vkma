import { useRouterState } from "@tanstack/react-router";
import { router } from "./routes";

/**
 * PROTOTYPE (spike 1) observability: the full relevant navigation state,
 * re-rendered on every change (prototype rule: surface the state).
 */
export function Hud() {
	const pathname = useRouterState({ select: s => s.location.pathname });
	const index = useRouterState({
		select: s => (s.location.state as { __TSR_index?: number } | undefined)?.__TSR_index,
	});
	const key = useRouterState({
		select: s => (s.location.state as { __TSR_key?: string } | undefined)?.__TSR_key,
	});
	const itemLoaded =
		router.routesById["/view-main/item/$id"] !== undefined &&
		router.routesById["/view-main/item/$id"].options.component !== undefined;
	const modalInfo = useRouterState({
		select: s => {
			const ids = s.matches
				.map(
					m =>
						(
							router.routesById[m.routeId as "/view-main/item/$id"]?.options
								.staticData as { modal?: string } | undefined
						)?.modal,
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
			<div style={{ color: "#7fd" }}>SPIKES 1–2: panels + modals</div>
			<div>path: {pathname}</div>
			<div>
				__TSR_index: {index ?? "null"} · key: {key ?? "—"}
			</div>
			<div>item lazy: {itemLoaded ? "loaded" : "pending"}</div>
			<div>modals: {modalInfo}</div>
			<div style={{ opacity: 0.7 }}>see console: [spike] mirror/vkuiHistory lines</div>
		</div>
	);
}
