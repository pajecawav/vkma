import type { TapEvent } from "@vkma.dev/protocol/schemas";
import { RequestJoiner } from "./join.ts";
import { installNativeCapture } from "./native.ts";
import { installWebCapture } from "./web.ts";

/**
 * The capture orchestrator. Installs every hook at construction — the
 * native wrap MUST be in place before the app's bridge module imports
 * (vk-bridge freezes its transport refs at import) — and BUFFERS the
 * spy-captured rows until the direct-handle question is settled:
 *
 * - `direct`: a `__vkmaDevtoolsBridge` handle was published on the page.
 *   Its tap contributes ONLY outgoing rows; the head-first raw layers
 *   (the page cannot mute them) keep reporting BOTH directions, with
 *   doubles merged by wire request_id. Adoption of a page-writable
 *   global is NOT a provenance proof, so it must never blind the
 *   independent capture.
 * - `spy`: the buffered rows flush and the hooks keep reporting. Our own
 *   execute sends ride a private @vkma.dev/bridge instance whose request
 *   ids it actually issued — the raw layers skip exactly those ids
 *   (issuer-scoped, one-shot), so a page tagging its own sends with the
 *   public reserved prefix can no longer elide them.
 */

export type CaptureMode = "resolving" | "direct" | "spy";

export interface BridgeHandle {
	tap: {
		subscribe: (listener: (event: TapEvent) => void) => () => void;
	};
	send: (name: string, params?: Record<string, unknown>) => Promise<unknown>;
}

/** The subset of @vkma.dev/bridge the capture needs from its private
 * instance (out-sends via its tap, executes via its send). */
export interface SpyBridge {
	tap: BridgeHandle["tap"];
	send: (name: string, params?: Record<string, unknown>) => Promise<unknown>;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const wireRequestId = (data: Record<string, unknown>): string | undefined => {
	const value = data["request_id"];
	return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
};

const OUT_DEDUPE_CAP = 1_000;

export class InspectorCapture {
	public mode: CaptureMode = "resolving";

	private readonly joiner = new RequestJoiner();
	private counter = 0;
	private buffer: TapEvent[] = [];
	/** Bound on resolving-phase rows: ten seconds of hostile native
	 * spam must not grow the page's memory unchecked (drop-oldest —
	 * the newest traffic is what an operator opens the panel for). */
	private static readonly BUFFER_CAP = 1_000;
	private sink: (event: TapEvent) => void = event => {
		this.buffer.push(event);
		if (this.buffer.length > InspectorCapture.BUFFER_CAP) {
			this.buffer.shift();
		}
	};
	private handle: BridgeHandle | undefined;
	private bridge: SpyBridge | undefined;
	/** Wire request_ids of outgoing rows already sunk (tap or raw — first
	 * reporter wins), so direct mode merges the two sources instead of
	 * doubling every send. Bounded, insertion-order drop-oldest. */
	private readonly sunkOutRequestIds = new Set<string>();
	/** Request ids the private execute bridge actually issued — the ONLY
	 * license for the raw layers to skip a send. */
	private readonly issuedExecIds = new Set<string>();

	public constructor() {
		installNativeCapture(call => this.onOutgoing(call.name, call.params));
		installWebCapture({
			onIncoming: (type, data) => this.onIncoming(type, data),
			onOutgoing: (name, params) => this.onOutgoing(name, params),
		});
	}

	/** The direct-handle verdict, once. The raw layers stay live in every
	 * mode; the tap contributes outgoing rows only. */
	public finalize(handle: BridgeHandle | undefined, sink: (event: TapEvent) => void): void {
		if (this.mode !== "resolving") {
			return;
		}
		this.sink = sink;
		if (handle !== undefined) {
			this.mode = "direct";
			this.handle = handle;
			handle.tap.subscribe(event => {
				if (event.direction !== "out" || event.name === "vk-connect") {
					return; // incoming is owned by the raw layers in every mode
				}
				// Our own row id (one counter for ALL sources — tap ids and
				// raw ids must never collide, reqId pairing depends on it).
				const id = ++this.counter;
				const requestId = isPlainObject(event.payload)
					? wireRequestId(event.payload)
					: undefined;
				if (requestId !== undefined) {
					this.noteSunkOut(requestId);
					this.joiner.record(requestId, id);
				}
				sink({
					id,
					ts: event.ts,
					direction: "out",
					kind: "send",
					name: event.name,
					payload: event.payload,
				});
			});
			// The tap's replay covers the page load's outgoing traffic; the
			// spy-era buffer keeps everything the replay does NOT already
			// carry (incoming rows, sends the tap never saw, host
			// reconstruction) — merged by wire request_id, never discarded.
			for (const event of this.buffer) {
				const requestId =
					event.direction === "out" && isPlainObject(event.payload)
						? wireRequestId(event.payload)
						: undefined;
				if (requestId !== undefined && this.sunkOutRequestIds.has(requestId)) {
					continue; // the tap replay already reported this send
				}
				sink(event);
			}
			this.buffer = [];
			return;
		}
		this.mode = "spy";
		for (const event of this.buffer) {
			sink(event);
		}
		this.buffer = [];
	}

	/** The private execute bridge: contributes its outgoing rows in every
	 * mode, and records the request ids it actually issued — the raw
	 * layers' only skip license. */
	public hookSpyBridge(bridge: SpyBridge): void {
		this.bridge = bridge;
		bridge.tap.subscribe(event => {
			if (event.direction !== "out" || event.name === "vk-connect") {
				return;
			}
			const id = ++this.counter;
			if (isPlainObject(event.payload)) {
				const requestId = wireRequestId(event.payload);
				if (requestId !== undefined) {
					this.issuedExecIds.add(requestId);
					this.joiner.record(requestId, id);
				}
			}
			this.sink({
				id,
				ts: event.ts,
				direction: "out",
				kind: "send",
				name: event.name,
				payload: event.payload,
			});
		});
	}

	/** Execute through whichever bridge is available. The private instance
	 * comes first: it is always present (main wires it before finalize)
	 * and is the one route the inspected page cannot forge — the adopted
	 * handle's send is page JS of unverified provenance. */
	public execute(name: string, params?: Record<string, unknown>): Promise<unknown> {
		if (this.bridge !== undefined) {
			return this.bridge.send(name, params);
		}
		if (this.handle !== undefined) {
			return this.handle.send(name, params);
		}
		return Promise.reject(new Error("capture not settled yet"));
	}

	// --- raw layer taps -----------------------------------------------------------

	private noteSunkOut(requestId: string): void {
		this.sunkOutRequestIds.add(requestId);
		if (this.sunkOutRequestIds.size > OUT_DEDUPE_CAP) {
			const oldest = this.sunkOutRequestIds.values().next().value;
			if (oldest !== undefined) {
				this.sunkOutRequestIds.delete(oldest);
			}
		}
	}

	private onOutgoing(name: string, params: Record<string, unknown>): void {
		const requestId = wireRequestId(params);
		// Skip only sends the private execute bridge ACTUALLY issued —
		// issuer-scoped and one-shot. The reserved prefix is public
		// (it ships in /inspector.js), so keying the skip on the wire
		// value would let the page elide its own sends.
		if (requestId !== undefined && this.issuedExecIds.delete(requestId)) {
			return;
		}
		// Resolving-phase rows go to the buffer — their dedup against the
		// tap's replay is decided at finalize time, not here (noting them
		// now would make the flush skip them as "already sunk").
		if (this.mode !== "resolving") {
			// Direct mode: the tap may have reported this send already
			// (its replay or a live emit) — first reporter wins, no doubles.
			if (requestId !== undefined && this.sunkOutRequestIds.has(requestId)) {
				return;
			}
			if (requestId !== undefined) {
				this.noteSunkOut(requestId);
			}
		}
		const id = ++this.counter;
		if (requestId !== undefined) {
			this.joiner.record(requestId, id);
		}
		this.sink({
			id,
			ts: Date.now(),
			direction: "out",
			kind: "send",
			name,
			payload: params,
		});
	}

	private onIncoming(type: string, data: Record<string, unknown>): void {
		if (type === "VKWebAppSettings") {
			return; // frame-id assignment — transport chatter, not VK semantics
		}
		// The raw layers own the incoming direction in EVERY mode — that
		// is exactly what a page-planted handle must not be able to mute.
		const requestId = wireRequestId(data);
		const sendId = requestId === undefined ? undefined : this.joiner.take(requestId);
		if (sendId !== undefined) {
			const { request_id: _stripped, ...payload } = data;
			this.sink({
				id: ++this.counter,
				ts: Date.now(),
				direction: "in",
				kind: "response",
				name: type,
				payload,
				reqId: sendId,
				ok: !("error_type" in data),
			});
			return;
		}
		this.sink({
			id: ++this.counter,
			ts: Date.now(),
			direction: "in",
			kind: "event",
			name: type,
			payload: data,
		});
	}
}
