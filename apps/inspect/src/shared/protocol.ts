/**
 * The inspect wire protocol: four JSON messages over a PeerJS
 * DataChannel (binarypack-serialized objects — PeerJS chunks anything
 * past ~16 KiB by itself). Payload types come from `@vkma.dev/protocol`
 * so every vkma.dev surface agrees on the shapes; this module is
 * types-and-constants only — the inspector bundle must never pull zod.
 */
import type { ClientInfo } from "@vkma.dev/protocol";
import type { TapEvent } from "@vkma.dev/protocol/schemas";

export const PROTOCOL_VERSION = 1 as const;

/** Request-id prefix of the inspector's own bridge instance — the capture
 * layers drop its sends so an execute never lands twice in the timeline
 * (the extension's `__vkma_ext_` trick). */
export const EXECUTE_REQUEST_ID_PREFIX = "__vkma_inspect_";

// --- inspector → host -----------------------------------------------------------

export interface InspectHelloMessage {
	v: typeof PROTOCOL_VERSION;
	t: "hello";
	/** Registration + heartbeat (same contract as `vkma:hello`). */
	info: ClientInfo;
}

export interface InspectEventsMessage {
	v: typeof PROTOCOL_VERSION;
	t: "events";
	clientId: string;
	events: TapEvent[];
}

export interface InspectExecResultMessage {
	v: typeof PROTOCOL_VERSION;
	t: "exec-result";
	execId: number;
	clientId: string;
	ok: boolean;
	payload?: unknown;
}

export type InspectorMessage =
	| InspectHelloMessage
	| InspectEventsMessage
	| InspectExecResultMessage;

// --- host → inspector -------------------------------------------------------------

export interface InspectExecuteMessage {
	v: typeof PROTOCOL_VERSION;
	t: "execute";
	execId: number;
	clientId: string;
	name: string;
	params?: Record<string, unknown>;
}

export type HostMessage = InspectExecuteMessage;
