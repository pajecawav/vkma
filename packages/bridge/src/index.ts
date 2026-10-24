/**
 * @vkma.dev/bridge — an independent VK Bridge for VK Mini Apps.
 *
 * The default export is a ready singleton; `createVKBridge` builds additional
 * instances. Every instance carries an always-on tap (see `onSend`/`onEvent`
 * and `tap`), which is what the VKMA devtools observe — no opt-in required.
 *
 * Merely importing this module publishes the page-wide devtools handle on
 * `globalThis.__vkmaDevtoolsBridge` (`{ tap, send }`), so the devtools
 * collector — loaded as a separate script, never sharing a module graph with
 * the app — can observe and drive the app's own bridge instance.
 */

import packageJson from "../package.json" with { type: "json" };
import { createVKBridge, type VkmaBridgeOptions } from "./bridge.ts";
import { createTap, type BridgeTap, type BridgeTapEvent } from "./tap.ts";

export { createVKBridge, type RequestIdPolicy, type VkmaBridgeOptions } from "./bridge.ts";
import type { VkmaBridge } from "./types.ts";
export { applyMiddleware, type Middleware, type MiddlewareAPI } from "./middleware.ts";
export { parseURLSearchParamsForGetLaunchParams, type LaunchParams } from "./launch-params.ts";
export { createTap } from "./tap.ts";
export type {
	SendOptions,
	VKBridge,
	VKBridgeErrorEvent,
	VKBridgeEvent,
	VKBridgeEventBase,
	VKBridgeIOEvent,
	VKBridgeReceiveOnlyEvent,
	VKBridgeResultEvent,
	VKBridgeSend,
	VKBridgeSubscribeHandler,
	VkmaBridge,
	AnyIOMethodName,
	AnyMethodName,
	AnyReceiveMethodName,
	AnyReceiveOnlyMethodName,
	AnyRequestMethodName,
	AnyRequestOnlyMethodName,
	ErrorData,
	ErrorDataAPIError,
	ErrorDataAuthError,
	ErrorDataClientError,
	FailedResponseEventName,
	RequestIdProp,
	RequestProps,
	ReceiveData,
	ResultResponseEventName,
} from "./types.ts";
export type {
	RequestMethodName,
	ReceiveMethodName,
	RequestOnlyMethodName,
	ReceiveOnlyMethodName,
	MethodName,
	IOMethodName,
	WidgetType,
} from "./deprecated.ts";
export type { ReceiveDataMap, ReceiveEventMap, RequestPropsMap } from "@vkma.dev/bridge-schema";
export * from "@vkma.dev/bridge-schema";

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

function sharedTap(): BridgeTap {
	const existing = globalScope[GLOBAL_KEY];
	if (existing) {
		return existing.tap;
	}
	const tap = createTap();
	globalScope[GLOBAL_KEY] = {
		tap,
		// The collector executes arbitrary method names — the handle stays
		// stringly typed by design.
		send: (name, params) => bridge.send(name as never, params as never),
	};
	return tap;
}

/** Options of the page-wide default instance: it shares the global tap. */
const defaultOptions: VkmaBridgeOptions = {
	tap: sharedTap(),
};

const bridge: VkmaBridge = createVKBridge(packageJson.version, defaultOptions);

/**
 * Subscribe to outgoing `send` calls of the default instance.
 */
export function onSend(
	listener: (event: BridgeTapEvent & { direction: "out" }) => void,
): () => void {
	return bridge.onSend(listener);
}

/**
 * Subscribe to everything incoming on the default instance: paired responses
 * and unsolicited events.
 */
export function onEvent(
	listener: (event: BridgeTapEvent & { direction: "in" }) => void,
): () => void {
	return bridge.onEvent(listener);
}

/** The shared tap of the default instance (buffered until first subscribe). */
export const bridgeTap: BridgeTap = bridge.tap;

/** The `globalThis` key the devtools collector looks the handle up by. */
export const devtoolsBridgeGlobalKey = GLOBAL_KEY;

export { bridge as default };
