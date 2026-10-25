import { useRouterState } from "@tanstack/react-router";
import { useSyncExternalStore } from "react";
import { fakeBridge } from "./bridge";

/**
 * PROTOTYPE (spike 3) observability: the host side of the bridge contract.
 */
export function HostControls() {
	useSyncExternalStore(
		onStoreChange => fakeBridge.subscribe(() => onStoreChange()),
		() => fakeBridge.sent.length,
	);
	const href = useRouterState({ select: s => s.location.href });

	const last =
		fakeBridge.sent.length > 0
			? ((
					fakeBridge.sent[fakeBridge.sent.length - 1]?.data as
						| { location?: string }
						| undefined
				)?.location ?? "—")
			: "—";

	return (
		<div
			style={{
				position: "fixed",
				zIndex: 100,
				left: 8,
				bottom: 8,
				maxWidth: 280,
				padding: "8px 10px",
				background: "rgba(20,20,20,0.85)",
				color: "#eee",
				fontFamily: "monospace",
				fontSize: 11,
				lineHeight: 1.5,
				borderRadius: 8,
			}}
		>
			<div style={{ color: "#fd7" }}>SPIKE 3: fake host</div>
			<div>router href: {href}</div>
			<div>page hash: {window.location.hash || "—"}</div>
			<div>last SetLocation: {last}</div>
			<div>host stack: {fakeBridge.hostStack.join(" | ") || "—"}</div>
			<button
				type="button"
				onClick={() => fakeBridge.hostJump("?path=%2Fabout&utm_source=mail")}
				style={{ marginTop: 4 }}
			>
				host: jump → /about (ChangeFragment)
			</button>
			<button
				type="button"
				onClick={() => fakeBridge.hostJump(location.hash.slice(1) || "?path=%2F")}
				style={{ marginTop: 4 }}
			>
				host: re-send current (loop test)
			</button>
		</div>
	);
}
