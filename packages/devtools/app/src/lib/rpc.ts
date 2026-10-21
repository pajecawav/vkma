import { defineRpcFunction } from "devframe";
import { connectDevframe } from "devframe/client";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
	ClientInfo,
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

export interface VkmaConnection {
	status: ConnectionStatus;
	events: WireEvent[];
	clients: ClientInfo[];
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
	const [clients, setClients] = useState<ClientInfo[]>([]);
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
						setEvents(prev =>
							[...prev, ...incoming]
								.filter(
									event =>
										!embeddedClientId || event.clientId === embeddedClientId,
								)
								.slice(-MAX_EVENTS),
						);
					},
				}) as never,
			);
			scoped.rpc.register(
				defineRpcFunction({
					name: "on-clients",
					type: "event",
					handler: (next: ClientInfo[]) => {
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

			const call = scoped.rpc.call as (
				name: string,
				...args: unknown[]
			) => Promise<DevtoolsState>;
			const state = await call("state");
			if (disposed) {
				return;
			}
			setEvents(
				state.events
					.filter(event => !embeddedClientId || event.clientId === embeddedClientId)
					.slice(-MAX_EVENTS),
			);
			setClients(
				embeddedClientId
					? state.clients.filter(client => client.clientId === embeddedClientId)
					: state.clients,
			);
			setStatus(client.status);
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
