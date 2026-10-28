/**
 * Wire protocol shared by every vkma.dev surface: the devtools node side,
 * its inject collector, the devtools-extension contexts and the SPA panel.
 * Kept structurally identical to `BridgeTapEvent` from `@vkma.dev/bridge`
 * but declared here so no consumer depends on the bridge at runtime.
 *
 * This module is types + tiny pure helpers only — no zod, so bundlers that
 * never touch `./schemas` (the devtools node side) don't pull it in.
 */

export type BridgeDirection = "out" | "in";
export type BridgeEventKind = "send" | "response" | "event";

export interface WireEvent {
	/** Tap-local id; unique per client, pairs responses with sends. */
	id: number;
	ts: number;
	clientId: string;
	direction: BridgeDirection;
	kind: BridgeEventKind;
	name: string;
	payload?: unknown;
	reqId?: number;
	ok?: boolean;
	/** Global sequence assigned by the collecting side (node / extension host). */
	seq: number;
	/**
	 * Epoch of the collecting side's store instance. The extension's host
	 * store dies with the page (seq restarts on reload), so panels key
	 * their dedupe by (runId, seq) and drop other runs' events.
	 */
	runId: string;
}

export interface ClientInfo {
	clientId: string;
	/** Fresh per page load: a reload starts a new session and wipes history. */
	sessionId: string;
	connectedAt: number;
	lastSeenAt: number;
	ua: string;
	url: string;
	/** `iframe` | `mobile-web` | `desktop-web` | `android` | `ios` | `standalone` */
	platform: string;
	/** Whether a vkma bridge handle was found on the page (direct-connect). */
	bridge: boolean;
	appId?: string;
	launchParams?: Record<string, string>;
}

export type ClientStatus = ClientInfo & {
	/** Computed by the collecting side: heartbeat within the online TTL. */
	online: boolean;
};

export type ExecResult =
	| { status: "ok"; payload: unknown }
	| { status: "error"; payload: unknown }
	| { status: "no-client"; clientId: string }
	| { status: "forbidden"; clientId: string }
	| { status: "timeout" };

export interface ExecResultReport {
	execId: number;
	clientId: string;
	ok: boolean;
	payload?: unknown;
}

export interface DevtoolsState {
	/** Epoch of the store that produced this snapshot (see WireEvent.runId). */
	runId: string;
	events: WireEvent[];
	clients: ClientStatus[];
}

/**
 * How a client's bridge traffic is captured. `direct` — the page runs
 * `@vkma.dev/bridge`, its tap is authoritative (replay buffer, pairing,
 * execute through the app's own instance). `spy` — a foreign bridge
 * (`@vkontakte/vk-bridge` in prod or third-party apps): events are
 * reconstructed from a second bridge instance in the isolated world
 * (host → app) and the top-frame vk-connect sniffer (app → host).
 */
export type CaptureMode = "direct" | "spy";

/**
 * The reserved window-message channel between the MAIN-world relay and
 * the isolated-world collector (same frame, same window). Lives in the
 * zod-free root: the relay must stay dependency-free.
 */
export const RELAY_CHANNEL = "__vkmaExt";

/**
 * Panel-facing connection states. The devtools SPA maps devframe transport
 * states onto these; the extension adapter reports its werpc port health.
 */
export type ConnectionStatus =
	| "connecting"
	| "connected"
	| "unauthorized"
	| "disconnected"
	| "error";

export { CLIENT_PALETTE, clientColorIndex } from "./colors.ts";
