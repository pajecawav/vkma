import vkBridge, { type VKBridge } from "@vkontakte/vk-bridge";
import { createTap, type BridgeTap, type BridgeTapEvent } from "./tap.ts";

export { createTap } from "./tap.ts";
export type { BridgeTap, BridgeTapEvent } from "./tap.ts";
export * from "@vkontakte/vk-bridge";

/**
 * The devtools bridge handle shared by every copy of this module on the page,
 * exposed on `globalThis` under a stable key so the devtools collector —
 * loaded as a separate script, never sharing a module graph with the app —
 * can observe and drive the app's own bridge instance:
 *
 * - `tap` — replay-buffered stream of sends, paired responses and events
 * - `send` — execute a bridge send inside the app (devtools "execute")
 */
const GLOBAL_KEY = "__vkmaDevtoolsBridge";

export interface DevtoolsBridgeHandle {
	tap: BridgeTap;
	send: (name: string, params?: Record<string, unknown>) => Promise<unknown>;
}

const globalScope = globalThis as typeof globalThis & {
	[GLOBAL_KEY]?: DevtoolsBridgeHandle;
};

function getTap(): BridgeTap {
	if (!globalScope[GLOBAL_KEY]) {
		globalScope[GLOBAL_KEY] = {
			tap: createTap(),
			send: (name, params) => vkBridge.send(name as never, (params ?? {}) as never),
		};
	}
	return globalScope[GLOBAL_KEY].tap;
}

const tap = getTap();

/** vk-bridge matches a send to its response by `request_id` in the response
 * payload; we inject our own ids so the tap can pair events exactly. */
const REQUEST_ID_PREFIX = "__vkma_";
const pendingRequests = new Map<string, number>();
let requestCounter = 0;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null;

function stripRequestId(data: unknown): unknown {
	if (!isPlainObject(data) || !("request_id" in data)) {
		return data;
	}
	const { request_id: _requestId, ...rest } = data;
	return rest;
}

// One internal subscription classifies every incoming bridge event:
// a payload carrying one of our request ids is the paired response to a
// wrapped send, everything else is an unsolicited event from VK.
vkBridge.subscribe((event: { detail?: { type?: unknown; data?: unknown } }) => {
	const { type, data } = event.detail ?? {};
	if (typeof type !== "string") {
		return;
	}

	if (isPlainObject(data) && typeof data["request_id"] === "string") {
		const requestId = data["request_id"];
		const reqTapId = pendingRequests.get(requestId);
		if (reqTapId !== undefined) {
			pendingRequests.delete(requestId);
			tap.emit({
				direction: "in",
				kind: "response",
				name: type,
				payload: stripRequestId(data),
				reqId: reqTapId,
				ok: !("error_type" in data),
			});
			return;
		}
	}

	tap.emit({ direction: "in", kind: "event", name: type, payload: data });
});

const wrappedSend: VKBridge["send"] = ((method: string, props?: Record<string, unknown>) => {
	const explicitRequestId =
		props !== undefined && typeof props["request_id"] === "string"
			? props["request_id"]
			: undefined;
	const requestId = explicitRequestId ?? `${REQUEST_ID_PREFIX}${++requestCounter}`;

	const tapId = tap.emit({
		direction: "out",
		kind: "send",
		name: method,
		payload: props,
	});
	if (explicitRequestId === undefined) {
		pendingRequests.set(requestId, tapId);
	}

	return vkBridge.send(
		method as never,
		{
			...props,
			request_id: requestId,
		} as never,
	);
}) as VKBridge["send"];

/** Subscribe to outgoing `send` calls (request side only). */
export function onSend(
	listener: (event: BridgeTapEvent & { direction: "out" }) => void,
): () => void {
	return tap.subscribe(event => {
		if (event.direction === "out") {
			listener(event as BridgeTapEvent & { direction: "out" });
		}
	});
}

/** Subscribe to every tapped bridge event: sends, paired responses, events. */
export function onTap(listener: (event: BridgeTapEvent) => void): () => void {
	return tap.subscribe(listener);
}

/** The shared tap (buffered until first subscribe — see `createTap`). */
export const bridgeTap: BridgeTap = tap;

/** The `globalThis` key the devtools collector looks the handle up by. */
export const devtoolsBridgeGlobalKey = GLOBAL_KEY;

export type VkmaBridge = VKBridge & {
	onSend: typeof onSend;
	onTap: typeof onTap;
};

const wrappedBridge = new Proxy(vkBridge, {
	get(target, prop, _receiver) {
		if (prop === "send") {
			return wrappedSend;
		}
		if (prop === "onSend") {
			return onSend;
		}
		if (prop === "onTap") {
			return onTap;
		}
		const value = Reflect.get(target, prop, target);
		return typeof value === "function"
			? (value as (...args: unknown[]) => unknown).bind(target)
			: value;
	},
}) as VkmaBridge;

export default wrappedBridge;
