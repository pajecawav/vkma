import { fileURLToPath } from "node:url";
import { defineDevframe } from "devframe";
import { VKMA_RPC, type ClientInfo, type DevtoolsState } from "../shared/protocol.ts";
import { DevtoolsStore } from "./store.ts";

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

		const broadcastClients = () => {
			void ctx.rpc.broadcast({
				method: VKMA_RPC.onClients,
				args: [store.listClients()],
				optional: true,
				event: true,
			});
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
					void ctx.rpc.broadcast({
						method: VKMA_RPC.onSessionReset,
						args: [{ clientId: info.clientId }],
						optional: true,
						event: true,
					});
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
				void ctx.rpc.broadcast({
					method: VKMA_RPC.onEvents,
					args: [stamped],
					optional: true,
					event: true,
				});
			},
		});

		ctx.rpc.register({
			name: VKMA_RPC.state,
			type: "query",
			handler: (): DevtoolsState => {
				return {
					events: store.snapshotEvents(),
					clients: store.listClients(),
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
