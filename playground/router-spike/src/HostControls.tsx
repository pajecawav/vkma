import { useSyncExternalStore } from "react";
import { fakeBridge } from "./bridge";

/**
 * PROTOTYPE observability: the host side of the bridge contract. Rendered
 * OUTSIDE the RouterProvider — no router hooks allowed here.
 */
export function HostControls() {
	useSyncExternalStore(
		onStoreChange => fakeBridge.subscribe(() => onStoreChange()),
		() => fakeBridge.sent.length,
	);

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
			<div style={{ color: "#fd7" }}>SPIKE: fake host</div>
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
				style={{ marginTop: 4, marginLeft: 4 }}
			>
				host: re-send current (loop test)
			</button>
		</div>
	);
}
