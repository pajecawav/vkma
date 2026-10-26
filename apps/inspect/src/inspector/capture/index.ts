import type { TapEvent } from "@vkma.dev/protocol/schemas";
import { EXECUTE_REQUEST_ID_PREFIX } from "../../shared/protocol.ts";
import { RequestJoiner } from "./join.ts";
import { installNativeCapture } from "./native.ts";
import { installWebCapture } from "./web.ts";

/**
 * The capture orchestrator. Installs every hook at construction — the
 * native wrap MUST be in place before the app's bridge module imports
 * (vk-bridge freezes its transport refs at import) — and BUFFERS the
 * spy-captured rows until the direct-handle question is settled:
 *
 * - `direct`: the page runs @vkma.dev/bridge — its tap (replay-buffered,
 *   request-paired) is authoritative and the spy buffer is discarded.
 * - `spy`: the buffered rows flush and the hooks keep reporting. Our own
 *   execute sends ride a private @vkma.dev/bridge instance whose request
 *   ids carry the reserved prefix — the raw layers skip them (no doubles)
 *   while the instance's tap contributes the `send` rows.
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

export class InspectorCapture {
	public mode: CaptureMode = "resolving";

	private readonly joiner = new RequestJoiner();
	private counter = 0;
	private buffer: TapEvent[] = [];
	private sink: (event: TapEvent) => void = event => {
		this.buffer.push(event);
	};
	private handle: BridgeHandle | undefined;
	private bridge: SpyBridge | undefined;

	public constructor() {
		installNativeCapture(call => this.onOutgoing(call.name, call.params));
		installWebCapture({
			onIncoming: (type, data) => this.onIncoming(type, data),
			onOutgoing: (name, params) => this.onOutgoing(name, params),
		});
	}

	/** The direct-handle verdict, once. Everything before this is buffered. */
	public finalize(handle: BridgeHandle | undefined, sink: (event: TapEvent) => void): void {
		if (this.mode !== "resolving") {
			return;
		}
		if (handle !== undefined) {
			this.mode = "direct";
			this.handle = handle;
			this.sink = sink;
			// The tap replays the whole page load — the spy-era rows would
			// duplicate it (the extension's capture-flip purge, done locally).
			this.buffer = [];
			handle.tap.subscribe(event => {
				if (event.name !== "vk-connect") {
					sink(event);
				}
			});
			return;
		}
		this.mode = "spy";
		for (const event of this.buffer) {
			sink(event);
		}
		this.buffer = [];
		this.sink = sink;
	}

	/** The private execute bridge: contributes ONLY its outgoing rows —
	 * the raw listeners own the incoming direction. */
	public hookSpyBridge(bridge: SpyBridge): void {
		this.bridge = bridge;
		bridge.tap.subscribe(event => {
			if (
				this.mode === "direct" ||
				event.direction !== "out" ||
				event.name === "vk-connect"
			) {
				return;
			}
			const id = ++this.counter;
			if (isPlainObject(event.payload)) {
				const requestId = wireRequestId(event.payload);
				if (requestId !== undefined) {
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

	/** Execute through whichever transport won: the app's own bridge in
	 * direct mode, our private instance otherwise. */
	public execute(name: string, params?: Record<string, unknown>): Promise<unknown> {
		if (this.handle !== undefined) {
			return this.handle.send(name, params);
		}
		if (this.bridge !== undefined) {
			return this.bridge.send(name, params);
		}
		return Promise.reject(new Error("capture not settled yet"));
	}

	// --- raw layer taps -----------------------------------------------------------

	private onOutgoing(name: string, params: Record<string, unknown>): void {
		if (this.mode === "direct") {
			return; // the tap is authoritative
		}
		const requestId = wireRequestId(params);
		if (requestId?.startsWith(EXECUTE_REQUEST_ID_PREFIX) === true) {
			return; // our own execute — its tap row already covers it
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
		if (this.mode === "direct") {
			return;
		}
		if (type === "VKWebAppSettings") {
			return; // frame-id assignment — transport chatter, not VK semantics
		}
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
