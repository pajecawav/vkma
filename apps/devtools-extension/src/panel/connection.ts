import type {
	ClientStatus,
	ConnectionStatus,
	DevtoolsState,
	ExecResult,
	WireEvent,
} from "@vkma.dev/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type WERPClient } from "werpc";

/**
 * The extension panel's data layer — the counterpart of the devtools
 * panel's `useVkma` (devframe RPC), same shape the presentational
 * components consume: status, seq-deduped events, the client registry
 * and execute. The store lives in the tab's host script (the `vkma`
 * namespace); the port dies with it, so a failed probe is "no host on
 * this tab", not an extension error.
 */

const MAX_EVENTS = 500;

/** The extension never runs the devtools OTP dance — no `unauthorized`. */
export type ExtensionStatus = Exclude<ConnectionStatus, "unauthorized">;

/** Absorb timeline batches: dedupe by the host-assigned global `seq`. */
function absorbEvents(prev: WireEvent[], incoming: WireEvent[]): WireEvent[] {
	const merged = new Map(prev.map(event => [event.seq, event]));
	for (const event of incoming) {
		merged.set(event.seq, event);
	}
	return [...merged.values()].toSorted((a, b) => a.seq - b.seq).slice(-MAX_EVENTS);
}

export interface ExtensionConnection {
	status: ExtensionStatus;
	events: WireEvent[];
	clients: ClientStatus[];
	lastError?: string;
	execute: (
		clientId: string,
		name: string,
		params: Record<string, unknown> | undefined,
	) => Promise<ExecResult>;
	reconnect: () => void;
}

export function useVkmaExtension(tabId: number): ExtensionConnection {
	const [status, setStatus] = useState<ExtensionStatus>("connecting");
	const [events, setEvents] = useState<WireEvent[]>([]);
	const [clients, setClients] = useState<ClientStatus[]>([]);
	const [lastError, setLastError] = useState<string | undefined>(undefined);
	const [nonce, setNonce] = useState(0);

	const clientRef = useRef<WERPClient | undefined>(undefined);

	const reconnect = useCallback(() => {
		setStatus("connecting");
		setLastError(undefined);
		setNonce(n => n + 1);
	}, []);

	useEffect(() => {
		let disposed = false;
		// Short-timeout probe client (a tab without a host script must not
		// hang the panel for the full call timeout) and a working client
		// whose timeout comfortably covers the store's 20s exec guard.
		const probe = createClient({
			clientName: "panel",
			tabId,
			scopeToTab: true,
			timeoutMs: 3_000,
		});
		const client = createClient({
			clientName: "panel",
			tabId,
			scopeToTab: true,
			timeoutMs: 30_000,
		});
		clientRef.current = client;

		const applyState = (state: DevtoolsState) => {
			setClients(state.clients);
			setEvents(prev => absorbEvents(prev, state.events));
		};

		void probe.vkma.state
			.query()
			.then(state => {
				if (disposed) {
					return;
				}
				setStatus("connected");
				applyState(state);

				client.vkma.timeline.subscribe(undefined, {
					onData: batch => setEvents(prev => absorbEvents(prev, batch)),
				});
				client.vkma.clientsChanged.subscribe(undefined, {
					onData: next => setClients(next),
				});
				client.vkma.sessionReset.subscribe(undefined, {
					onData: ({ clientId }) =>
						setEvents(prev => prev.filter(event => event.clientId !== clientId)),
				});
			})
			.catch((error: unknown) => {
				if (disposed) {
					return;
				}
				setLastError(error instanceof Error ? error.message : String(error));
				setStatus("error");
			});

		return () => {
			disposed = true;
			clientRef.current = undefined;
			probe.dispose();
			client.dispose();
		};
	}, [tabId, nonce]);

	const execute = useCallback<ExtensionConnection["execute"]>(async (clientId, name, params) => {
		const client = clientRef.current;
		if (!client) {
			throw new Error("not connected");
		}
		// zod infers `payload?: unknown` (optional) while ExecResult keeps
		// the devtools wire shape (property always present on ok/error).
		return (await client.vkma.execute.mutate({ clientId, name, params })) as ExecResult;
	}, []);

	return { status, events, clients, lastError, execute, reconnect };
}
