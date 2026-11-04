import { fileURLToPath } from "node:url";
import { defineDevframe } from "devframe";
import {
	VKMA_RPC,
	type ClientInfo,
	type DevtoolsState,
	type ExecResult,
	type WireEvent,
} from "../shared/protocol.ts";
import { ExecResponders } from "./exec-responders.ts";
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
		// Execute results settle only for the session that registered the
		// client (see ExecResponders), bounded by the same registry.
		const execResponders = new ExecResponders();
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
		// The channel id carries the store's runId: the devframe instance
		// survives dev-server restarts (globalThis in the rsbuild adapter),
		// and its replay window would otherwise mix the previous store's
		// chunks into the fresh run; panels flip-flop between epochs. A
		// per-run channel starts empty; readers derive the id from
		// `state.runId`.
		const timeline = ctx.rpc.streaming.create<WireEvent>(`vkma:timeline:${store.runId}`, {
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
		// online TTL 15s: a background tab's throttled heartbeat turns the
		// client offline instead of deleting it). Never holds the process.
		let onlineFingerprint = "";
		const statusTimer = setInterval(() => {
			execResponders.prune(clientId => store.getClient(clientId) !== undefined);
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
				// The registering session becomes the only legitimate
				// exec-result responder for this client (see ExecResponders).
				execResponders.bind(ctx.rpc.getCurrentRpcSession()?.meta, info.clientId);
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
					return { runId: store.runId, events, clients };
				}
				return {
					runId: store.runId,
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
				// Only the session that registered the client may settle its
				// execs: every collector sees the broadcast's execId, so the
				// id alone would let any page forge any pending answer.
				store.settleExec(report, execResponders.responderOf(report.clientId));
			},
		});

		ctx.rpc.register({
			name: VKMA_RPC.deleteClients,
			type: "action",
			// Registry hygiene only: live clients are skipped (see
			// DevtoolsStore.deleteClients), history is not touched.
			handler: (payload: { clientIds: string[] }) => {
				const removed = store.deleteClients(payload?.clientIds ?? []);
				if (removed.length > 0) {
					broadcastClients();
				}
				return removed;
			},
		});

		ctx.rpc.register({
			name: VKMA_RPC.execute,
			type: "action",
			handler: runExecute,
		});

		// Agent/MCP surface. `jsonSerializable: true` (required for
		// agent-exposed functions) means every app-provided payload is
		// sanitized to plain JSON first, and the panel RPCs above keep the
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
					return { runId: store.runId, events, clients };
				}
				return {
					runId: store.runId,
					events: events.filter(event => event.clientId === scope),
					clients: clients.filter(client => client.clientId === scope),
				};
			},
		});

		// The execute twin is a plain agent tool, not an agent-flagged RPC:
		// devframe projects a single-payload RPC arg positionally, so the
		// MCP input schema would demand `{ arg0: … }` and flat input would
		// fail validation (DF0043). The explicit flat `inputSchema` wins
		// over the synthesized one, and the handler receives the caller's
		// input as-is, no positional conversion.
		ctx.agent.registerTool({
			id: VKMA_RPC.mcpExecute,
			title: "Execute a VK Bridge method",
			description:
				"Execute a VK Bridge method (e.g. VKWebAppGetUserInfo) on a connected mini app client and await its result. Client ids come from vkma:mcp-state. Mutates the running app's bridge state, not files.",
			safety: "action",
			inputSchema: {
				type: "object",
				properties: {
					clientId: {
						type: "string",
						description: "Target client id from vkma:mcp-state",
					},
					name: {
						type: "string",
						description: "VK Bridge method name, e.g. VKWebAppGetUserInfo",
					},
					params: {
						type: "object",
						description: "Optional VK Bridge method params",
					},
				},
				required: ["clientId", "name"],
				additionalProperties: false,
			},
			examples: [
				{
					args: [{ clientId: "c3f…", name: "VKWebAppGetUserInfo" }],
					description: "Fetch the current user on the given client",
				},
			],
			handler: async (input: {
				clientId?: unknown;
				name?: unknown;
				params?: Record<string, unknown>;
			}) => {
				// Plain tools bypass RPC args validation, so guard the required
				// fields here; `params` passes through unchecked (the page-side
				// execute reports VK's own rejection).
				if (typeof input?.clientId !== "string" || typeof input?.name !== "string") {
					throw new Error("vkma:mcp-execute: string `clientId` and `name` are required");
				}
				return toMcpJson(
					await runExecute({
						clientId: input.clientId,
						name: input.name,
						params: input.params,
					}),
				);
			},
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
			// The pending exec is bound to the session that registered the
			// target client; reports from any other session are forgeries
			// (every collector sees the broadcast's execId).
			const { execId, promise } = store.beginExec(
				execResponders.responderOf(payload.clientId),
			);
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
