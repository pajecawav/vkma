import { fileURLToPath } from "node:url";
import { defineDevframe } from "devframe";
import {
	VKMA_RPC,
	type ClientInfo,
	type DevtoolsState,
	type WireEvent,
} from "../shared/protocol.ts";
import { DevtoolsStore } from "./store.ts";
import { EmbeddedSubscriptions, groupByClient } from "./subscriptions.ts";

/**
 * The vkma devframe node side: event ring buffer, client registry and
 * execute routing. See PRODUCT.md for the product truth behind these names.
 */
export const vkmaDevframe = defineDevframe({
	id: "vkma",
	name: "VKMA Devtools",
	version: "0.0.0",
	packageName: "@vkma.dev/devtools",
	description: "VK Bridge event devtools for VK Mini Apps",
	homepage: "https://github.com/pajecawav/vkma",
	importMetaUrl: import.meta.url,
	clientAssets: fileURLToPath(new URL("../../dist-client", import.meta.url)),

	setup(ctx) {
		const store = new DevtoolsStore();
		// Embedded panels (the FAB's `?client=` iframe) subscribe to one
		// client id; the node then delivers them only their own traffic via
		// targeted broadcasts instead of the full feed.
		const embedded = new EmbeddedSubscriptions();

		const broadcastClients = () => {
			const clients = store.listClients();
			void ctx.rpc.broadcast({
				method: VKMA_RPC.onClients,
				args: [clients],
				optional: true,
				event: true,
				// the full registry only goes to sessions without a scope
				filter: client => !embedded.has(client.$meta),
			});
			for (const [meta, clientId] of embedded.scoped()) {
				const scoped = clients.filter(client => client.clientId === clientId);
				if (scoped.length === 0) {
					continue;
				}
				void ctx.rpc.broadcast({
					method: VKMA_RPC.onClients,
					args: [scoped],
					optional: true,
					event: true,
					filter: client => client.$meta === meta,
				});
			}
		};

		const broadcastEvents = (stamped: WireEvent[]) => {
			void ctx.rpc.broadcast({
				method: VKMA_RPC.onEvents,
				args: [stamped],
				optional: true,
				event: true,
				filter: client => !embedded.has(client.$meta),
			});
			for (const [meta, clientId] of embedded.scoped()) {
				const scoped = groupByClient(stamped).get(clientId);
				if (scoped === undefined) {
					continue;
				}
				void ctx.rpc.broadcast({
					method: VKMA_RPC.onEvents,
					args: [scoped],
					optional: true,
					event: true,
					filter: client => client.$meta === meta,
				});
			}
		};

		const broadcastSessionReset = (clientId: string) => {
			void ctx.rpc.broadcast({
				method: VKMA_RPC.onSessionReset,
				args: [{ clientId }],
				optional: true,
				event: true,
				filter: client => !embedded.has(client.$meta),
			});
			for (const [meta, scopedClientId] of embedded.scoped()) {
				if (scopedClientId !== clientId) {
					continue;
				}
				void ctx.rpc.broadcast({
					method: VKMA_RPC.onSessionReset,
					args: [{ clientId }],
					optional: true,
					event: true,
					filter: client => client.$meta === meta,
				});
			}
		};

		// Broadcast when a client's online flag flips (heartbeat every 5s,
		// online TTL 15s — a background tab's throttled heartbeat turns the
		// client offline instead of deleting it). Never holds the process.
		let onlineFingerprint = "";
		const statusTimer = setInterval(() => {
			const fingerprint = store
				.listClients()
				.map(client => `${client.clientId}:${client.online ? 1 : 0}`)
				.join(",");
			if (fingerprint !== onlineFingerprint) {
				onlineFingerprint = fingerprint;
				broadcastClients();
			}
		}, 5_000);
		statusTimer.unref?.();

		ctx.rpc.register({
			name: VKMA_RPC.hello,
			type: "event",
			handler: (info: ClientInfo) => {
				const previous = store.getClient(info.clientId);
				const sessionChanged =
					previous !== undefined && previous.sessionId !== info.sessionId;
				const changed = store.touchClient(info);
				if (sessionChanged) {
					// The page reloaded: its previous session's history is dead
					// on every surface.
					store.purgeEvents(info.clientId);
					broadcastSessionReset(info.clientId);
				}
				if (changed) {
					broadcastClients();
				}
			},
		});

		ctx.rpc.register({
			name: VKMA_RPC.events,
			type: "event",
			handler: (payload: {
				clientId: string;
				events: Omit<import("../shared/protocol.ts").WireEvent, "seq" | "clientId">[];
			}) => {
				const stamped = store.pushEvents(payload.clientId, payload.events);
				if (stamped.length === 0) {
					return;
				}
				broadcastEvents(stamped);
			},
		});

		ctx.rpc.register({
			name: VKMA_RPC.subscribe,
			type: "query",
			handler: (payload: { clientId: string }) => {
				const session = ctx.rpc.getCurrentRpcSession();
				if (session === undefined) {
					return;
				}
				embedded.bind(session.meta, payload.clientId);
			},
		});

		ctx.rpc.register({
			name: VKMA_RPC.state,
			type: "query",
			handler: (): DevtoolsState => {
				const events = store.snapshotEvents();
				const clients = store.listClients();
				const scope = embedded.scopeOf(ctx.rpc.getCurrentRpcSession()?.meta);
				if (scope === undefined) {
					return { events, clients };
				}
				return {
					events: events.filter(event => event.clientId === scope),
					clients: clients.filter(client => client.clientId === scope),
				};
			},
		});

		ctx.rpc.register({
			name: VKMA_RPC.execResult,
			type: "event",
			handler: (report: {
				execId: number;
				clientId: string;
				ok: boolean;
				payload?: unknown;
			}) => {
				store.settleExec(report);
			},
		});

		ctx.rpc.register({
			name: VKMA_RPC.execute,
			type: "action",
			handler: async (payload: {
				clientId: string;
				name: string;
				params?: Record<string, unknown>;
			}) => {
				const scope = embedded.scopeOf(ctx.rpc.getCurrentRpcSession()?.meta);
				if (scope !== undefined && scope !== payload.clientId) {
					// an embedded session may only execute against its own client
					return { status: "forbidden", clientId: payload.clientId } as const;
				}
				if (!store.getClient(payload.clientId)) {
					return { status: "no-client", clientId: payload.clientId } as const;
				}
				const { execId, promise } = store.beginExec();
				await ctx.rpc.broadcast({
					method: VKMA_RPC.clientExecute,
					args: [{ execId, ...payload }],
					optional: true,
					event: true,
				});
				return promise;
			},
		});
	},
});

export default vkmaDevframe;
