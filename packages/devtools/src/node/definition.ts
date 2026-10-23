import { fileURLToPath } from "node:url";
import { defineDevframe } from "devframe";
import { s } from "devframe/utils/simple-schema";
import {
	VKMA_RPC,
	type ClientInfo,
	type DevtoolsState,
	type ExecResult,
	type WireEvent,
} from "../shared/protocol.ts";
import { sanitizeEvent, toMcpJson } from "./serialize.ts";
import { DevtoolsStore } from "./store.ts";
import { EmbeddedSubscriptions } from "./subscriptions.ts";

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
		// targeted broadcasts and per-client streams instead of the full feed.
		const embedded = new EmbeddedSubscriptions();
		// NOTE: we register on the raw ctx.rpc rather than ctx.scope('vkma'):
		// scoped broadcasts carry no `filter`, and the embedded panel scoping
		// is built on broadcast filters. Wire names stay `vkma:*` in VKMA_RPC.

		// The timeline rides a devframe streaming channel: one evergreen
		// `live` stream carries every event (a late standalone panel replays
		// the last RING_LIMIT chunks on connect), and lazily-created
		// `client:<id>` streams carry a single client's traffic for embedded
		// panels, seeded with that client's history on subscribe. An
		// unsubscribed sink keeps buffering: losing every subscriber aborts
		// the sink's signal but not the stream itself.
		const timeline = ctx.rpc.streaming.create<WireEvent>("vkma:timeline", {
			replayWindow: 500,
		});
		const live = timeline.start({ id: "live" });

		/** Write one stamped event to the live stream and the per-client
		 * stream if one exists (created lazily by `ensureClientStream`). */
		const pushToStreams = (event: WireEvent) => {
			live.write(event);
			timeline.get(`client:${event.clientId}`)?.write(event);
		};

		/** Lazily create the `client:<id>` stream and seed it with the
		 * client's buffered history so late embedded panels replay via
		 * the channel's replay window, not a custom snapshot path. */
		const ensureClientStream = (clientId: string) => {
			const id = `client:${clientId}`;
			const existing = timeline.get(id);
			if (existing) {
				return existing;
			}
			const sink = timeline.start({ id });
			for (const event of store.snapshotEvents()) {
				if (event.clientId !== clientId) {
					continue;
				}
				sink.write(event);
			}
			return sink;
		};

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
				for (const event of stamped) {
					pushToStreams(event);
				}
			},
		});

		ctx.rpc.register({
			name: VKMA_RPC.subscribe,
			type: "query",
			// Embedded mode: the panel pins itself to one client and receives
			// its back a lazily-built `client:<id>` stream, seeded with the
			// client's buffered history; the channel's replay window replays
			// missed chunks to reconnecting readers, so the panel consumes
			// one timeline spine and drops no snapshot race.
			handler: (payload: { clientId: string }) => {
				const session = ctx.rpc.getCurrentRpcSession();
				if (session === undefined) {
					return;
				}
				embedded.bind(session.meta, payload.clientId);
				const sink = ensureClientStream(payload.clientId);
				return { streamId: sink.id };
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
			handler: runExecute,
		});

		// Agent/MCP surface. `jsonSerializable: true` (required for
		// agent-exposed functions) means every app-provided payload is
		// sanitized to plain JSON first — the panel RPCs above keep the
		// structured-clone wire for Maps/Sets/cycles.
		ctx.rpc.register({
			name: VKMA_RPC.mcpState,
			type: "query",
			jsonSerializable: true,
			agent: {
				description:
					"Read the VK Bridge devtools state: connected mini app clients (platform, URL, online) and the recent bridge event timeline (last 500 events, newest last). Event payloads are JSON-sanitized.",
				safety: "read",
			},
			handler: (): DevtoolsState => {
				const events = store.snapshotEvents().map(sanitizeEvent);
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
			name: VKMA_RPC.mcpExecute,
			type: "action",
			jsonSerializable: true,
			agent: {
				description:
					"Execute a VK Bridge method (e.g. VKWebAppGetUserInfo) on a connected mini app client and await its result. Client ids come from vkma:mcp-state. Mutates the running app's bridge state, not files.",
				safety: "action",
				examples: [
					{
						args: [{ clientId: "c3f…", name: "VKWebAppGetUserInfo" }],
						description: "Fetch the current user on the given client",
					},
				],
			},
			handler: async (payload: {
				clientId: string;
				name: string;
				params?: Record<string, unknown>;
			}) => toMcpJson(await runExecute(payload)),
			args: [
				// `params` stays undocumented-by-schema on purpose (no `any()`
				// in simple-schema); it passes through as an extra key, and the
				// agent description + examples cover it.
				s.object({
					clientId: s.describe(s.string(), "Target client id from vkma:mcp-state"),
					name: s.describe(s.string(), "VK Bridge method name, e.g. VKWebAppGetUserInfo"),
				}),
			],
		});

		async function runExecute(payload: {
			clientId: string;
			name: string;
			params?: Record<string, unknown>;
		}): Promise<ExecResult> {
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
		}
	},
});

export default vkmaDevframe;
