/**
 * Wire protocol shared by the node side, the inject collector and the SPA.
 * The types themselves live in `@vkma.dev/protocol` (shared with the
 * devtools-extension); this module keeps the devframe-specific surface —
 * wire names and the `devframe` RPC augmentation — next to them.
 */
import type { ClientStatus } from "@vkma.dev/protocol";

export type {
	BridgeDirection,
	BridgeEventKind,
	ClientInfo,
	ClientStatus,
	ConnectionStatus,
	CaptureMode,
	DevtoolsState,
	ExecResult,
	ExecResultReport,
	WireEvent,
} from "@vkma.dev/protocol";

export { CLIENT_PALETTE, clientColorIndex } from "@vkma.dev/protocol";

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
	/** Panel → node: manual registry cleanup of offline entries. */
	deleteClients: "vkma:delete-clients",
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
