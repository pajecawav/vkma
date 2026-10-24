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

export type ClientStatus = ClientInfo & {
	/** Computed by the node side: heartbeat within the online TTL. */
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
	events: WireEvent[];
	clients: ClientStatus[];
}

/**
 * Wire names, `vkma`-namespaced by hand on the node side (the panel and
 * the inject collector strip the prefix and talk through
 * `client.scope("vkma")`, which re-prefixes them) — the augment below
 * mirrors the browser-registered ids. Broadcasts stay on the RAW node rpc
 * because scoped broadcasts carry no `filter`, which the embedded panel
 * scoping is built on.
 */
export const VKMA_RPC = {
	hello: "vkma:hello",
	events: "vkma:events",
	state: "vkma:state",
	/** Panel → node: scope this RPC session to a single client id. */
	subscribe: "vkma:subscribe",
	execute: "vkma:execute",
	execResult: "vkma:exec-result",
	/** client-side (browser-registered) functions */
	clientExecute: "vkma:client-execute",
	onClients: "vkma:on-clients",
	onSessionReset: "vkma:on-session-reset",
	/**
	 * Agent-facing (MCP) mirrors of `state`/`execute`: same data, but every
	 * app-provided payload sanitized to plain JSON. `mcpState` is an
	 * agent-flagged RPC (no args → flat input); `mcpExecute` is only the
	 * agent tool id — it registers via `ctx.agent.registerTool` with an
	 * explicit flat inputSchema, not as an RPC.
	 */
	mcpState: "vkma:mcp-state",
	mcpExecute: "vkma:mcp-execute",
} as const;

declare module "devframe" {
	interface DevframeRpcClientFunctions {
		/** Node → every panel: the current client registry. */
		"vkma:on-clients": (clients: ClientStatus[]) => void;
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
