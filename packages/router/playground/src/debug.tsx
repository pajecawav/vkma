import { useRouterState } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";
import { fakeBridge } from "./bridge";

/**
 * The manual-e2e observability, armed by `?debug=1` (router search — inside
 * the hash: `#/?debug=1`). Surfaces the bridge contract (SetLocation
 * payloads, host stack, host-initiated ChangeFragment jumps) and the router
 * internals (path, __TSR_index, lazy chunk state). Rendered OUTSIDE the
 * navigation UI, at the very bottom-left.
 *
 * The flag PERSISTS across navigations (localStorage) — the panel exists to
 * be watched WHILE navigating, so a single tab click must not kill it.
 * Disarm via the panel's hide button or `?debug=0`.
 */

const DEBUG_KEY = "vkma:debug";

let debugArmed = false;
try {
	debugArmed = window.localStorage.getItem(DEBUG_KEY) === "1";
} catch {
	// storage unavailable (private mode) — the URL param still arms it
}
const listeners = new Set<() => void>();

function setDebugArmed(on: boolean): void {
	debugArmed = on;
	try {
		if (on) {
			window.localStorage.setItem(DEBUG_KEY, "1");
		} else {
			window.localStorage.removeItem(DEBUG_KEY);
		}
	} catch {
		// ignore — the in-memory flag still works for this page
	}
	for (const listener of listeners) {
		listener();
	}
}

function subscribeDebug(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function DebugOverlay() {
	const searchDebug = useRouterState({
		select: state =>
			new URLSearchParams(state.location.searchStr.replace(/^\?/, "")).get("debug"),
	});
	const armed = useSyncExternalStore(
		subscribeDebug,
		() => debugArmed,
		() => false,
	);

	// one-way latch: the URL param arms/disarms, navigations keep it armed
	useEffect(() => {
		if (searchDebug === "1" && !debugArmed) {
			setDebugArmed(true);
		}
		if (searchDebug === "0" && debugArmed) {
			setDebugArmed(false);
		}
	}, [searchDebug]);

	if (!armed) {
		return null;
	}
	return <DebugPanel />;
}
const panelStyle = {
	position: "fixed",
	zIndex: 1000,
	left: 8,
	bottom: 8,
	maxWidth: 340,
	padding: "10px 12px",
	background: "rgba(23, 23, 28, 0.92)",
	color: "#eee",
	fontFamily: "monospace",
	fontSize: 11,
	lineHeight: 1.55,
	borderRadius: 10,
	boxShadow: "0 4px 24px rgba(0,0,0,0.35)",
} as const;

const buttonStyle = {
	marginTop: 6,
	marginRight: 4,
	font: "inherit",
	padding: "3px 8px",
	borderRadius: 6,
	border: "1px solid #555",
	background: "transparent",
	color: "#eee",
	cursor: "pointer",
} as const;

function DebugPanel() {
	// re-render on every bridge message
	useSyncExternalStore(
		onStoreChange => fakeBridge.subscribe(() => onStoreChange()),
		() => fakeBridge.sent.length,
	);

	const pathname = useRouterState({ select: state => state.location.pathname });
	const searchStr = useRouterState({ select: state => state.location.searchStr });
	const index = useRouterState({
		select: state =>
			(state.location.state as { __TSR_index?: number } | undefined)?.__TSR_index,
	});
	const modalId = useRouterState({
		select: state => (state.location.search as { modal?: string } | undefined)?.modal ?? null,
	});

	const lastSent =
		fakeBridge.sent.length > 0
			? ((
					fakeBridge.sent[fakeBridge.sent.length - 1]?.data as
						| { location?: string }
						| undefined
				)?.location ?? "—")
			: "—";

	return (
		<div style={panelStyle}>
			<div style={{ color: "#8fd6c1" }}>@vkma.dev/router — debug (?debug=1)</div>
			<div>path: {pathname}</div>
			<div>__TSR_index: {index ?? "null"}</div>
			<div>global modal: {modalId ?? "—"}</div>
			<div>last SetLocation: {lastSent}</div>
			<div>host stack: {fakeBridge.hostStack.join(" | ") || "—"}</div>
			<button type="button" style={buttonStyle} onClick={() => fakeBridge.hostJump("/about")}>
				host: jump → /about
			</button>
			<button
				type="button"
				style={buttonStyle}
				onClick={() => fakeBridge.hostJump(pathname + searchStr)}
			>
				host: re-send current (echo)
			</button>
			<button type="button" style={buttonStyle} onClick={() => setDebugArmed(false)}>
				скрыть (останется до ?debug=1)
			</button>
		</div>
	);
}
