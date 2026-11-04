import type { WireEvent } from "@vkma.dev/protocol";
import type { TapEvent, VkConnectEnvelope } from "@vkma.dev/protocol/schemas";

/**
 * Spy-mode pairing: the app's outgoing requests are synthesized by the
 * host sniffer while their responses arrive as collector tap events; the
 * only join key is the wire `request_id`.
 *
 * Synthesized sends draw ids from a NEGATIVE per-client counter: tap ids
 * count from 1, and `buildGroups`/React keys join on bare `id`: sharing
 * the positive space once made two different rows collide on
 * `${clientId}:${id}`, which misplaced live rows mid-list and could glue
 * a response onto a stranger's group.
 */
export class SpyTracker {
	private readonly clients = new Map<string, ClientSpyState>();

	private state(clientId: string): ClientSpyState {
		let state = this.clients.get(clientId);
		if (state === undefined) {
			state = { nextSyntheticId: 0, requests: new Map() };
			this.clients.set(clientId, state);
		}
		return state;
	}

	public reset(clientId: string): void {
		this.clients.delete(clientId);
	}

	/** A sniffed app → host envelope becomes a `send` event. */
	public synthesizeSend(
		clientId: string,
		envelope: VkConnectEnvelope,
		ts = Date.now(),
	): Omit<WireEvent, "seq" | "clientId" | "runId"> {
		const state = this.state(clientId);
		const id = --state.nextSyntheticId;
		const requestId = envelope.params["request_id"];
		if (
			requestId !== undefined &&
			(typeof requestId === "string" || typeof requestId === "number")
		) {
			state.requests.set(String(requestId), id);
		}
		return {
			id,
			ts,
			direction: "out",
			kind: "send",
			name: envelope.handler,
			payload: envelope.params,
		};
	}

	/**
	 * Reclassify a collector tap event: an unsolicited `event` carrying a
	 * sniffed request's wire `request_id` is that request's `response`;
	 * everything else passes through untouched.
	 */
	public reclassify(
		clientId: string,
		event: TapEvent,
	): Omit<WireEvent, "seq" | "clientId" | "runId"> {
		if (event.kind !== "event" || !isPlainObject(event.payload)) {
			return event;
		}
		const wireRequestId = event.payload["request_id"];
		if (typeof wireRequestId !== "string" && typeof wireRequestId !== "number") {
			return event;
		}
		const state = this.clients.get(clientId);
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
}

interface ClientSpyState {
	nextSyntheticId: number;
	/** app request_id (string form) → synthesized send event id */
	requests: Map<string, number>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);
