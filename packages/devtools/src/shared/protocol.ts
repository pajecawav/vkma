/**
 * Wire protocol shared by the node side, the inject collector and the SPA.
 * Kept structurally identical to `BridgeTapEvent` from `@vkma.dev/bridge`
 * but declared here so this package never depends on the bridge at runtime.
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
	/** Global sequence assigned by the node side. */
	seq: number;
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
	/** Whether the devtools bridge handle was found on the page. */
	bridge: boolean;
	appId?: string;
	launchParams?: Record<string, string>;
}

export type ExecResult =
	| { status: "ok"; payload: unknown }
	| { status: "error"; payload: unknown }
	| { status: "no-client"; clientId: string }
	| { status: "timeout" };

export interface ExecResultReport {
	execId: number;
	clientId: string;
	ok: boolean;
	payload?: unknown;
}

export interface DevtoolsState {
	events: WireEvent[];
	clients: ClientInfo[];
}

export const VKMA_RPC = {
	hello: "vkma:hello",
	events: "vkma:events",
	state: "vkma:state",
	execute: "vkma:execute",
	execResult: "vkma:exec-result",
	/** client-side (browser-registered) functions */
	clientExecute: "vkma:client-execute",
	onEvents: "vkma:on-events",
	onClients: "vkma:on-clients",
	onSessionReset: "vkma:on-session-reset",
} as const;

declare module "devframe" {
	interface DevframeRpcClientFunctions {
		/** Node → every panel: live events batch. */
		"vkma:on-events": (events: WireEvent[]) => void;
		/** Node → every panel: the current client registry. */
		"vkma:on-clients": (clients: ClientInfo[]) => void;
		/** Node → every panel: a client's page reloaded — drop its history. */
		"vkma:on-session-reset": (payload: { clientId: string }) => void;
		/** Node → every page script: an execute routed to its target. */
		"vkma:client-execute": (payload: {
			execId: number;
			clientId: string;
			name: string;
			params?: Record<string, unknown>;
		}) => void;
	}
}
