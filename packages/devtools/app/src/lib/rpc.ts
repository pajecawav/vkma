import { defineRpcFunction } from "devframe";
import { connectDevframe } from "devframe/client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	ClientStatus,
	DevtoolsState,
	ExecResult,
	WireEvent,
} from "../../../src/shared/protocol.ts";

export type ConnectionStatus =
	| "connecting"
	| "connected"
	| "unauthorized"
	| "disconnected"
	| "error";

type RpcClient = Awaited<ReturnType<typeof connectDevframe>>;

/** A `vkma`-scoped client: auto-prefixed ids, its own rpc surface. */
function scopeVkma(rpc: RpcClient) {
	return rpc.scope("vkma");
}
type ScopedClient = ReturnType<typeof scopeVkma>;

const MAX_EVENTS = 500;

/**
 * Absorb timeline chunks: the reader delivers the replay buffer after the
 * first live chunks can already have arrived, so dedupe by the globally
 * unique (runId, seq) and keep chronological order. A chunk from an
 * unknown run (dev-server restart reassigned seqs) resets the state.
 * A runId-less collecting side (pre-epoch node build, e.g. a dev server
 * still holding the old plugin in memory) forms its own legacy epoch —
 * bare-seq absorb, not a drop.
 */
function absorbEvents(prev: WireEvent[], incoming: WireEvent[]): WireEvent[] {
	const last = incoming.at(-1);
	if (last === undefined) {
		return prev;
	}
	const runId = last.runId;
	const merged = new Map(
		prev
			.filter(event => event.runId === runId)
			.map(event => [`${event.runId}:${event.seq}`, event]),
	);
	for (const event of incoming) {
		merged.set(`${event.runId}:${event.seq}`, event);
	}
	return [...merged.values()].toSorted((a, b) => a.seq - b.seq).slice(-MAX_EVENTS);
}

export interface VkmaConnection {
	status: ConnectionStatus;
	events: WireEvent[];
	clients: ClientStatus[];
	/** Last connection-level or RPC error message, reset on a healthy status. */
	lastError?: string;
	requestAuthCode: () => Promise<void>;
	submitAuthCode: (code: string) => Promise<boolean>;
	execute: (
		clientId: string,
		name: string,
		params: Record<string, unknown> | undefined,
	) => Promise<ExecResult>;
	/** Registry hygiene: removes the given offline clients (live ones are
	 * skipped server-side). @returns the ids actually removed. */
	deleteClients: (clientIds: string[]) => Promise<string[]>;
	reconnect: () => void;
}

export function useVkma(embeddedClientId?: string): VkmaConnection {
	const [status, setStatus] = useState<ConnectionStatus>("connecting");
	const [events, setEvents] = useState<WireEvent[]>([]);
	const [clients, setClients] = useState<ClientStatus[]>([]);
	const [lastError, setLastError] = useState<string | undefined>(undefined);
	const scopedRef = useRef<ScopedClient | undefined>(undefined);
	const rpcRef = useRef<RpcClient | undefined>(undefined);
	const [nonce, setNonce] = useState(0);

	const reconnect = useCallback(() => {
		setStatus("connecting");
		setLastError(undefined);
		setNonce(n => n + 1);
	}, []);

	useEffect(() => {
		let disposed = false;
		// A fresh client per effect run — the devframe client does not
		// reconnect on its own. Tracked so cleanup closes it: without
		// close() every reconnect() would leak the previous WebSocket.
		let liveClient: RpcClient | undefined;

		void connectDevframe({
			// Above the node side's 20s exec timeout so a slow execute
			// resolves with { status: "timeout" } instead of rejecting.
			callTimeout: 30_000,
		}).then(client => {
			if (disposed) {
				client.close?.();
				return;
			}
			liveClient = client;
			rpcRef.current = client;
			const scoped = scopeVkma(client);
			scopedRef.current = scoped;

			scoped.rpc.register(
				defineRpcFunction({
					name: "on-clients",
					type: "event",
					handler: (next: ClientStatus[]) => {
						setClients(
							embeddedClientId
								? next.filter(client => client.clientId === embeddedClientId)
								: next,
						);
					},
				}) as never,
			);
			scoped.rpc.register(
				defineRpcFunction({
					name: "on-session-reset",
					type: "event",
					// A client's page reloaded — its previous history is dead.
					handler: (payload: { clientId: string }) => {
						setEvents(prev =>
							prev.filter(event => event.clientId !== payload.clientId),
						);
					},
				}) as never,
			);

			// The timeline streams ('connected' only happens once trust is
			// in, so subscription failures on the unauthorized path are
			// irrelevant — startReader is idempotent and re-invoked by the
			// status listener when the panel completes the OTP flow).
			let readerStarted = false;
			const call = scoped.rpc.call as (name: string, ...args: unknown[]) => Promise<unknown>;
			const startReader = async () => {
				if (readerStarted || disposed) {
					return;
				}
				readerStarted = true;
				// State first: the timeline channel id is run-scoped (the
				// devframe instance survives dev-server restarts, its replay
				// window must never mix store epochs), so the reader needs
				// `runId` before subscribing. Chunks written between the
				// snapshot and the subscribe land in the replay window — the
				// (runId, seq) dedupe absorbs the overlap.
				const state = (await call("state")) as DevtoolsState;
				if (disposed) {
					return;
				}
				setClients(
					embeddedClientId
						? state.clients.filter(client => client.clientId === embeddedClientId)
						: state.clients,
				);
				const streamId = embeddedClientId
					? (
							(await call("subscribe", {
								clientId: embeddedClientId,
							})) as { streamId: string }
						).streamId
					: "live";
				const reader = scoped.rpc.streaming.subscribe<WireEvent>(
					// Fully qualified on purpose: qualifyName() passes names that
					// already contain `:` through unscoped, and the bare
					// `timeline:<runId>` would never reach `vkma:timeline:<runId>`.
					`vkma:timeline:${state.runId}`,
					streamId,
				);
				void (async () => {
					for await (const event of reader) {
						if (disposed) {
							return;
						}
						setEvents(prev => absorbEvents(prev, [event]));
					}
				})().catch(() => {
					// transport dropped — the devframe client does not reconnect
					// on its own, the panel shows the gate and reconnect() makes
					// a fresh client (and reader)
				});
			};

			if (client.status === "connected") {
				void startReader();
			}
			client.events.on("connection:status", (next: string) => {
				if (next === "connected") {
					setLastError(undefined);
					void startReader();
				}
				setStatus(next as ConnectionStatus);
			});

			client.events.on("connection:error", (error: Error) => {
				setLastError(error.message);
			});
			client.events.on("rpc:error", (error: Error, method: string) => {
				setLastError(`${method}: ${error.message}`);
			});
		});

		return () => {
			disposed = true;
			scopedRef.current = undefined;
			rpcRef.current = undefined;
			// The devframe client never reconnects on its own — without an
			// explicit close every reconnect() leaks the previous WebSocket.
			liveClient?.close?.();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [nonce]);

	const requestAuthCode = useCallback(async () => {
		await rpcRef.current?.requestAuthCode();
	}, []);

	const submitAuthCode = useCallback(async (code: string) => {
		const rpc = rpcRef.current;
		if (!rpc) {
			return false;
		}
		return rpc.requestTrustWithCode(code);
	}, []);

	const execute = useCallback<VkmaConnection["execute"]>(async (clientId, name, params) => {
		const scoped = scopedRef.current;
		if (!scoped) {
			throw new Error("not connected");
		}
		const call = scoped.rpc.call as (name: string, ...args: unknown[]) => Promise<ExecResult>;
		return call("execute", { clientId, name, params });
	}, []);

	const deleteClients = useCallback<VkmaConnection["deleteClients"]>(async clientIds => {
		const scoped = scopedRef.current;
		if (!scoped) {
			throw new Error("not connected");
		}
		const call = scoped.rpc.call as (name: string, ...args: unknown[]) => Promise<string[]>;
		return call("delete-clients", { clientIds });
	}, []);

	return {
		status,
		events,
		clients,
		lastError,
		requestAuthCode,
		submitAuthCode,
		execute,
		deleteClients,
		reconnect,
	};
}
