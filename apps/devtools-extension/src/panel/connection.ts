import type {
	ClientStatus,
	ConnectionStatus,
	DevtoolsState,
	ExecResult,
	WireEvent,
} from "@vkma.dev/protocol";
import { useCallback, useEffect, useRef, useState } from "react";
import { createClient, type WERPClient } from "werpc";
import { api } from "../shared/api.ts";
import { absorbEvents } from "./absorb.ts";

/**
 * The extension panel's data layer — the counterpart of the devtools
 * panel's `useVkma` (devframe RPC), same shape the presentational
 * components consume: status, seq-deduped events, the client registry
 * and execute. The store lives in the tab's host script (the `vkma`
 * namespace); the port dies with it, so a failed probe is "no host on
 * this tab", not an extension error.
 */

/** The extension never runs the devtools OTP dance — no `unauthorized`. */
export type ExtensionStatus = Exclude<ConnectionStatus, "unauthorized">;

export interface PanelConnection {
	status: ExtensionStatus;
	events: WireEvent[];
	clients: ClientStatus[];
	lastError?: string;
	execute: (
		clientId: string,
		name: string,
		params: Record<string, unknown> | undefined,
	) => Promise<ExecResult>;
	/** Registry hygiene: removes offline clients (live skipped
	 * server-side). @returns the ids actually removed. */
	deleteClients: (clientIds: string[]) => Promise<string[]>;
	reconnect: () => void;
}

export type ExtensionConnection = PanelConnection;

// --- global mode: every VK tab at once ----------------------------------------

import { HOST_MATCHES } from "../shared/hosts.ts";
import { MergedTimeline } from "./merge.ts";

/** Tabs whose URL sits on a VK host — exactly where host.js runs. */
function useHostTabs(): number[] | undefined {
	const [tabIds, setTabIds] = useState<number[] | undefined>(undefined);
	useEffect(() => {
		const refresh = () => {
			void api.tabs.query({ url: [...HOST_MATCHES] }).then(tabs => {
				setTabIds(
					tabs.map(tab => tab.id).filter((id): id is number => typeof id === "number"),
				);
			});
		};
		refresh();
		// onUpdated fires on every navigation tick — only URL/status flips
		// change the host population
		const onUpdated = (_tabId: number, change: { status?: string; url?: string }) => {
			if (change.status === "loading" || change.url !== undefined) {
				refresh();
			}
		};
		api.tabs.onCreated.addListener(refresh);
		api.tabs.onRemoved.addListener(refresh);
		api.tabs.onUpdated.addListener(onUpdated);
		return () => {
			api.tabs.onCreated.removeListener(refresh);
			api.tabs.onRemoved.removeListener(refresh);
			api.tabs.onUpdated.removeListener(onUpdated);
		};
	}, []);
	return tabIds;
}

interface TabFeed {
	probe: WERPClient;
	client: WERPClient;
	/** By the HOST's seq — globally colliding, only the merger sees these. */
	events: Map<number, WireEvent>;
	/** The host store's epoch: a reload restarts its seq, ghosts are purged. */
	runId?: string;
	clients: ClientStatus[];
	/** probing → live (probe answered) → dead (probe failed: no host). */
	state: "probing" | "live" | "dead";
}

export interface GlobalConnection extends Omit<PanelConnection, "lastError"> {
	tabCount: number;
}

/**
 * The wide panel: one werpc client per VK tab (werpc's explicit-tabId
 * routing — the same mechanism the side panel uses), merged into a single
 * feed. All state stays with the per-tab hosts; this is a pure aggregate,
 * the /__vkma/ standalone panel's counterpart.
 */
export function useVkmaAllTabs(): GlobalConnection {
	const tabIds = useHostTabs();
	const feedsRef = useRef(new Map<number, TabFeed>());
	const mergerRef = useRef(new MergedTimeline());
	const [reattach, setReattach] = useState(0);
	const [derived, setDerived] = useState<{
		events: WireEvent[];
		clients: ClientStatus[];
		live: number;
		probing: number;
	}>({ events: [], clients: [], live: 0, probing: 0 });

	const publish = useCallback(() => {
		const feeds = [...feedsRef.current.values()];
		setDerived({
			events: mergerRef.current.merge(feeds.map(feed => ({ events: feed.events.values() }))),
			clients: feeds.flatMap(feed => feed.clients),
			live: feeds.filter(feed => feed.state === "live").length,
			probing: feeds.filter(feed => feed.state === "probing").length,
		});
	}, []);

	// Attach/detach feeds as the host population changes. The diff runs on
	// every tabIds refresh (navigations included) but only touches feeds
	// that actually appeared/disappeared — surviving tabs keep their
	// subscriptions and history.
	useEffect(() => {
		const feeds = feedsRef.current;

		if (tabIds !== undefined) {
			for (const id of Array.from(feeds.keys())) {
				if (!tabIds.includes(id)) {
					const feed = feeds.get(id);
					feed?.probe.dispose();
					feed?.client.dispose();
					feeds.delete(id);
				}
			}
			for (const tabId of tabIds) {
				if (feeds.has(tabId)) {
					continue;
				}
				// Short probe, long-working client — same contract as local mode.
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
				const feed: TabFeed = {
					probe,
					client,
					events: new Map(),
					clients: [],
					state: "probing",
				};
				feeds.set(tabId, feed);

				void probe.vkma.state
					.query()
					.then(state => {
						if (feeds.get(tabId) !== feed) {
							return;
						}
						feed.state = "live";
						if (feed.runId !== state.runId) {
							feed.runId = state.runId;
							feed.events.clear();
						}
						for (const event of state.events) {
							feed.events.set(event.seq, event);
						}
						feed.clients = state.clients;
						publish();
					})
					.catch(() => {
						if (feeds.get(tabId) !== feed) {
							return;
						}
						feed.state = "dead";
						publish();
					});

				client.vkma.timeline.subscribe(undefined, {
					onData: batch => {
						if (feeds.get(tabId) !== feed) {
							return;
						}
						// A batch from an unknown store epoch means the host page
						// reloaded (werpc resurrected the subscription): its seq
						// restarted, the previous run's events are ghosts.
						const runId = batch.at(-1)?.runId;
						if (runId !== undefined && feed.runId !== runId) {
							feed.runId = runId;
							feed.events.clear();
						}
						for (const event of batch) {
							feed.events.set(event.seq, event);
						}
						// Data is proof of a host — covers a probe that raced a
						// not-yet-injected host script (extension installed while
						// the tab was already open): without this the feed would
						// stay "dead" with events flowing into it unseen.
						feed.state = "live";
						publish();
					},
				});
				client.vkma.clientsChanged.subscribe(undefined, {
					onData: next => {
						if (feeds.get(tabId) !== feed) {
							return;
						}
						feed.state = "live";
						feed.clients = next;
						publish();
					},
				});
				client.vkma.sessionReset.subscribe(undefined, {
					onData: ({ clientId }) => {
						if (feeds.get(tabId) !== feed) {
							return;
						}
						for (const [seq, event] of feed.events) {
							if (event.clientId === clientId) {
								feed.events.delete(seq);
							}
						}
						publish();
					},
				});
			}
			publish();
		}
	}, [tabIds, reattach, publish]);

	// The page is going away for real: release every port.
	useEffect(() => {
		return () => {
			for (const feed of feedsRef.current.values()) {
				feed.probe.dispose();
				feed.client.dispose();
			}
			feedsRef.current.clear();
		};
	}, []);

	const reconnect = useCallback(() => {
		for (const feed of feedsRef.current.values()) {
			feed.probe.dispose();
			feed.client.dispose();
		}
		feedsRef.current.clear();
		setReattach(n => n + 1);
	}, []);

	const execute = useCallback<GlobalConnection["execute"]>(async (clientId, name, params) => {
		for (const feed of feedsRef.current.values()) {
			if (feed.clients.some(client => client.clientId === clientId)) {
				// zod infers payload optional; ExecResult keeps it required
				return (await feed.client.vkma.execute.mutate({
					clientId,
					name,
					params,
				})) as ExecResult;
			}
		}
		return { status: "no-client", clientId };
	}, []);

	const deleteClients = useCallback<GlobalConnection["deleteClients"]>(async clientIds => {
		const removed: string[] = [];
		for (const feed of feedsRef.current.values()) {
			const mine = clientIds.filter(id =>
				feed.clients.some(client => client.clientId === id),
			);
			if (mine.length === 0) {
				continue;
			}
			removed.push(...(await feed.client.vkma.deleteClients.mutate({ clientIds: mine })));
		}
		return removed;
	}, []);

	const status: ExtensionStatus =
		derived.live > 0
			? "connected"
			: tabIds === undefined || derived.probing > 0
				? "connecting"
				: "error";

	return {
		status,
		events: derived.events,
		clients: derived.clients,
		tabCount: tabIds?.length ?? 0,
		execute,
		deleteClients,
		reconnect,
	};
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
		// whose timeout comfortably covers the store's 60s exec guard.
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
			timeoutMs: 70_000,
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

	const deleteClients = useCallback<ExtensionConnection["deleteClients"]>(async clientIds => {
		const client = clientRef.current;
		if (!client) {
			throw new Error("not connected");
		}
		return client.vkma.deleteClients.mutate({ clientIds });
	}, []);

	return { status, events, clients, lastError, execute, deleteClients, reconnect };
}
