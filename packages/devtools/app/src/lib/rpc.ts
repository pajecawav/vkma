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
 * seq is globally unique (assigned by the node side), so it dedupes the
 * snapshot+subscribe race and double deliveries in one place.
 */
function mergeEvents(prev: WireEvent[], incoming: WireEvent[]): WireEvent[] {
	const seen = new Set(prev.map(event => event.seq));
	const fresh = incoming.filter(event => !seen.has(event.seq));
	// eslint-disable-next-line no-console
	console.log("[vkma] mergeEvents", {
		prev: prev.length,
		incoming: incoming.length,
		fresh: fresh.length,
		incomingSeqs: incoming.map(e => e.seq),
	});
	return [...prev, ...fresh].slice(-MAX_EVENTS);
}

export interface VkmaConnection {
	status: ConnectionStatus;
	events: WireEvent[];
	clients: ClientStatus[];
	requestAuthCode: () => Promise<void>;
	submitAuthCode: (code: string) => Promise<boolean>;
	execute: (
		clientId: string,
		name: string,
		params: Record<string, unknown> | undefined,
	) => Promise<ExecResult>;
	reconnect: () => void;
}

export function useVkma(embeddedClientId?: string): VkmaConnection {
	const [status, setStatus] = useState<ConnectionStatus>("connecting");
	const [events, setEvents] = useState<WireEvent[]>([]);
	const [clients, setClients] = useState<ClientStatus[]>([]);
	const scopedRef = useRef<ScopedClient | undefined>(undefined);
	const rpcRef = useRef<RpcClient | undefined>(undefined);
	const [nonce, setNonce] = useState(0);

	const reconnect = useCallback(() => {
		setStatus("connecting");
		setNonce(n => n + 1);
	}, []);

	useEffect(() => {
		let disposed = false;
		// A fresh client per effect run — the devframe client does not
		// reconnect on its own.
		void connectDevframe().then(async client => {
			if (disposed) {
				return;
			}
			rpcRef.current = client;
			const scoped = scopeVkma(client);
			scopedRef.current = scoped;

			scoped.rpc.register(
				defineRpcFunction({
					name: "on-events",
					type: "event",
					handler: (incoming: WireEvent[]) => {
						setEvents(prev => {
							const merged = mergeEvents(prev, incoming);
							const scoped = embeddedClientId
								? merged.filter(event => event.clientId === embeddedClientId)
								: merged;
							return scoped.slice(-MAX_EVENTS);
						});
					},
				}) as never,
			);
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

			client.events.on("connection:status", (next: string) => {
				setStatus(next as ConnectionStatus);
			});

			const call = scoped.rpc.call as (name: string, ...args: unknown[]) => Promise<unknown>;
			// Embedded mode: scope this RPC session server-side first, so even
			// the snapshot only ever carries this client's traffic. The local
			// filters below stay as a net against the subscribe race.
			if (embeddedClientId) {
				await call("subscribe", { clientId: embeddedClientId });
			}
			const state = (await call("state")) as DevtoolsState;
			if (disposed) {
				return;
			}
			setEvents(prev => {
				// dedupe against anything that arrived via on-events while the
				// snapshot was in flight
				const merged = mergeEvents(prev, state.events);
				const scoped = embeddedClientId
					? merged.filter(event => event.clientId === embeddedClientId)
					: merged;
				return scoped.slice(-MAX_EVENTS);
			});
			setClients(
				embeddedClientId
					? state.clients.filter(client => client.clientId === embeddedClientId)
					: state.clients,
			);
		});

		return () => {
			disposed = true;
			scopedRef.current = undefined;
			rpcRef.current = undefined;
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

	return {
		status,
		events,
		clients,
		requestAuthCode,
		submitAuthCode,
		execute,
		reconnect,
	};
}
