import { DevtoolsStore } from "@vkma.dev/devtools/store";
import type { ClientStatus, DevtoolsState, ExecResult, WireEvent } from "@vkma.dev/protocol";
import {
	clientInfoSchema,
	executeInputSchema,
	looksLikeVkConnect,
	tapEventSchema,
	vkConnectEnvelopeSchema,
	type TapEvent,
} from "@vkma.dev/protocol/schemas";
import { createClient, type InferNamespace, createHandler, initWERPC } from "werpc";
import { z } from "zod";
import { mountFab } from "./fab.ts";
import { BatchedHub, Hub } from "./hub.ts";

/**
 * The host script — the extension's "node side", running in the top frame
 * of every VK host page. Owns the event store (the very same DevtoolsStore
 * the devtools plugin runs on the dev server), the vk-connect sniffer for
 * spy-mode clients, and serves the `vkma` werpc namespace every surface of
 * the tab (FAB iframe, tab panel, side panel, frame collectors) talks to.
 */
const werpc = initWERPC();
const store = new DevtoolsStore();

const timelineHub = new BatchedHub<WireEvent>(100);
const clientsHub = new Hub<ClientStatus[]>();
const sessionResetHub = new Hub<{ clientId: string }>();
const executeHub = new Hub<{
	execId: number;
	clientId: string;
	name: string;
	params?: Record<string, unknown>;
}>();

const broadcastClients = () => {
	clientsHub.publish(store.listClients());
};

// --- spy pairing state ---------------------------------------------------------

/**
 * Spy-mode pairing: the app's outgoing requests are sniffed in this frame
 * (top) while their responses land in the app frame's collector — the only
 * join key is the wire `request_id`. Synthesized sends get locally unique
 * ids so the panel's request grouping works exactly like direct mode.
 */
interface SpyState {
	origin: string;
	webFrameId?: string;
	nextLocalId: number;
	/** app request_id (string form) → synthesized send event id */
	requests: Map<string, number>;
}

const spyStates = new Map<string, SpyState>();
const clientByWebFrameId = new Map<string, string>();
const clientByOrigin = new Map<string, string>();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

function ensureSpyState(clientId: string, origin: string): SpyState {
	let state = spyStates.get(clientId);
	if (state === undefined) {
		state = { origin, nextLocalId: 0, requests: new Map() };
		spyStates.set(clientId, state);
	}
	return state;
}

/** Reclassify a spy-mode collector event: an unsolicited tap `event`
 * carrying a sniffed request's id is that request's `response`. */
function reclassify(clientId: string, event: TapEvent): Omit<WireEvent, "seq" | "clientId"> {
	if (event.kind !== "event" || !isPlainObject(event.payload)) {
		return event;
	}
	const wireRequestId = event.payload["request_id"];
	if (typeof wireRequestId !== "string" && typeof wireRequestId !== "number") {
		return event;
	}
	const state = spyStates.get(clientId);
	const sendId = state?.requests.get(String(wireRequestId));
	if (state === undefined || sendId === undefined) {
		return event;
	}
	state.requests.delete(String(wireRequestId));
	const { request_id: _stripped, ...payload } = event.payload;
	return {
		...event,
		kind: "response",
		reqId: sendId,
		ok: !("error_type" in event.payload),
		payload,
	};
}

// --- the vk-connect sniffer ----------------------------------------------------

/** Our own execute sends ride the same wire — the sniffer must not echo them. */
const EXT_REQUEST_ID_PREFIX = "__vkma_ext_";

function attributeEnvelope(webFrameId: string | undefined, origin: string): string | undefined {
	if (webFrameId !== undefined && clientByWebFrameId.has(webFrameId)) {
		return clientByWebFrameId.get(webFrameId);
	}
	return clientByOrigin.get(origin);
}

window.addEventListener("message", event => {
	const data: unknown = event.data;
	// The app's web transport posts the envelope to its parent — which is
	// this window; every listener world sees it (the spy trick). Self-posts
	// (the host page talking to itself) and non-vk-connect chatter are not
	// mini app traffic.
	if (event.source === window || !looksLikeVkConnect(data)) {
		return;
	}
	const parsed = vkConnectEnvelopeSchema.safeParse(data);
	if (!parsed.success) {
		return;
	}
	const envelope = parsed.data;

	const clientId = attributeEnvelope(envelope.webFrameId, event.origin);
	if (clientId === undefined) {
		return; // a frame with no collector (ads, service iframes) — not ours
	}
	const client = store.getClient(clientId);
	if (client === undefined) {
		return;
	}
	if (client.bridge) {
		return; // direct mode: the page-world tap is authoritative, no doubles
	}
	const requestId = envelope.params["request_id"];
	if (typeof requestId === "string" && requestId.startsWith(EXT_REQUEST_ID_PREFIX)) {
		return; // the collector's own execute send — its tap already reports it
	}

	const state = ensureSpyState(clientId, event.origin);
	const localId = ++state.nextLocalId;
	const wire: Omit<WireEvent, "seq" | "clientId"> = {
		id: localId,
		ts: Date.now(),
		direction: "out",
		kind: "send",
		name: envelope.handler,
		payload: envelope.params,
	};
	if (
		requestId !== undefined &&
		(typeof requestId === "string" || typeof requestId === "number")
	) {
		state.requests.set(String(requestId), localId);
	}
	const stamped = store.pushEvents(clientId, [wire]);
	if (stamped.length > 0) {
		timelineHub.pushMany(stamped);
	}
});

// --- the vkma namespace --------------------------------------------------------

const helloInputSchema = z.object({
	info: clientInfoSchema,
	/** The frame's `webFrameId` (VKWebAppSettings) — joins sniffed
	 * envelopes to their collector when the host assigned one. */
	webFrameId: z.string().optional(),
	origin: z.string(),
});

const execResultInputSchema = z.object({
	execId: z.number(),
	clientId: z.string(),
	ok: z.boolean(),
	payload: z.unknown().optional(),
});

const pushInputSchema = z.object({
	clientId: z.string(),
	events: z.array(tapEventSchema),
});

const handler = createHandler({
	namespace: "vkma",
	router: werpc.router({
		/** Full state snapshot (panels merge it with the live streams). */
		state: werpc.procedure.query((): DevtoolsState => ({
			events: store.snapshotEvents(),
			clients: store.listClients(),
		})),

		/** Live timeline: the buffered history first, then batches. */
		timeline: werpc.procedure.subscription(async function* ({ signal }) {
			yield* drainable(signal, timelineHub, () => [store.snapshotEvents()]);
		}),

		/** The client registry, whenever its fingerprint changes. */
		clientsChanged: werpc.procedure.subscription(async function* ({ signal }) {
			yield* drainable(signal, clientsHub, () => []);
		}),

		/** A client's page reloaded — panels drop its history. */
		sessionReset: werpc.procedure.subscription(async function* ({ signal }) {
			yield* drainable(signal, sessionResetHub, () => []);
		}),

		/** Frame collectors receive executes routed to their client. */
		executeRequests: werpc.procedure.subscription(async function* ({ signal }) {
			yield* drainable(signal, executeHub, () => []);
		}),

		/** Collector registration + heartbeat (same contract as the
		 * devtools collector's `vkma:hello`). */
		hello: werpc.procedure.input(helloInputSchema).mutation(({ input }) => {
			const { info, webFrameId, origin } = input;
			const previous = store.getClient(info.clientId);
			const sessionChanged = previous !== undefined && previous.sessionId !== info.sessionId;
			const changed = store.touchClient(info);

			if (webFrameId !== undefined) {
				clientByWebFrameId.set(webFrameId, info.clientId);
			}
			clientByOrigin.set(origin, info.clientId);
			if (!info.bridge) {
				ensureSpyState(info.clientId, origin).webFrameId = webFrameId;
			}

			if (sessionChanged) {
				// The page reloaded: this session's history is dead everywhere.
				store.purgeEvents(info.clientId);
				spyStates.delete(info.clientId);
				sessionResetHub.publish({ clientId: info.clientId });
				broadcastClients();
				return;
			}
			if (changed) {
				broadcastClients();
			}
		}),

		/** Tap events from a frame collector (both capture modes). */
		push: werpc.procedure.input(pushInputSchema).mutation(({ input }) => {
			const client = store.getClient(input.clientId);
			if (client === undefined) {
				return;
			}
			const out = input.events
				// `vk-connect` is the bridge's own transport chatter
				.filter(event => event.name !== "vk-connect")
				.map(event => (client.bridge ? event : reclassify(input.clientId, event)));
			const stamped = store.pushEvents(input.clientId, out);
			if (stamped.length > 0) {
				timelineHub.pushMany(stamped);
			}
		}),

		/** Panels execute through the store's timeout-guarded round-trip. */
		execute: werpc.procedure
			.input(executeInputSchema)
			.mutation(async ({ input }): Promise<ExecResult> => {
				if (!store.getClient(input.clientId)) {
					return { status: "no-client", clientId: input.clientId };
				}
				const { execId, promise } = store.beginExec();
				executeHub.publish({ execId, ...input });
				return promise;
			}),

		/** Collecters settle pending executes. */
		execResult: werpc.procedure.input(execResultInputSchema).mutation(({ input }) => {
			store.settleExec(input);
		}),
	}),
});

type VkmaHandler = typeof handler;

declare module "werpc" {
	interface WERPCNamespaces extends InferNamespace<VkmaHandler> {}
}

/**
 * Subscribe first, emit `initial()` immediately, then drain the queue —
 * pushes racing the initial snapshot may duplicate, which the panels
 * absorb by `seq` (same snapshot-vs-stream race as the devtools panel).
 */
async function* drainable<T>(
	signal: AbortSignal | undefined,
	hub: { subscribe: (listener: (value: T) => void) => () => void },
	initial: () => T[],
): AsyncGenerator<T> {
	const queue: T[] = [];
	let wake: (() => void) | undefined;
	let aborted = signal?.aborted ?? false;
	const unsubscribe = hub.subscribe(value => {
		queue.push(value);
		wake?.();
	});
	const abort = () => {
		aborted = true;
		queue.push(SENTINEL as T); // wake the drain loop — a bare `wake` could race
		wake?.();
	};
	signal?.addEventListener("abort", abort);
	try {
		for (const value of initial()) {
			yield value;
		}
		// `aborted` flips in the abort closure when the subscriber goes away
		// oxlint-disable-next-line eslint/no-unmodified-loop-condition
		while (!aborted) {
			if (queue.length === 0) {
				await new Promise<void>(resolve => {
					wake = resolve;
				});
				wake = undefined;
			}
			for (const value of queue.splice(0)) {
				if (value !== SENTINEL) {
					yield value;
				}
			}
		}
	} finally {
		signal?.removeEventListener("abort", abort);
		unsubscribe();
	}
}

const SENTINEL: unique symbol = Symbol("drain-end");

// --- surfaces -------------------------------------------------------------------

void (async () => {
	const client = createClient({ clientName: "host", scopeToTab: true });

	// The FAB needs its tab id for the panel URL; it also pre-enables the
	// tab-specific side panel so opening it later needs no user gesture.
	const tabId = await client.background.getTabId.query();
	if (tabId === null) {
		return;
	}
	await client.background.enableSidePanel.mutate().catch(() => {});

	const setFabHidden = mountFab({
		panelUrl: `${chrome.runtime.getURL("panel.html")}?tab=${tabId}`,
	});

	// Two simultaneous panels is noise: the FAB yields to the side panel.
	client.background.sidePanelChanged.subscribe(undefined, {
		onData: ({ open }) => setFabHidden(open),
	});

	// The registry's online/offline fingerprint flips on a timer, not on
	// hello — broadcast it like the devtools node side does.
	let lastFingerprint = "";
	setInterval(() => {
		const fingerprint = store
			.listClients()
			.map(client => `${client.clientId}:${client.online ? 1 : 0}`)
			.join(",");
		if (fingerprint !== lastFingerprint) {
			lastFingerprint = fingerprint;
			broadcastClients();
		}
	}, 5_000);
})();
