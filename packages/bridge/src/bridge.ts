/**
 * The bridge core: transport dispatch, subscription fan-out, promise pairing
 * and the always-on tap.
 *
 * Transports (checked lazily on every call, unlike the load-time caches of
 * the reference implementation — same in practice, testable in unit tests):
 *
 * - Android WebView: `window.AndroidBridge[method](JSON.stringify(props))`
 * - iOS WebView: `window.webkit.messageHandlers[method].postMessage(props)`
 * - React Native WebView: `window.ReactNativeWebView.postMessage(JSON)`
 * - Web (iframe on vk.ru / m.vk.ru): `parent.postMessage` with the
 *   `type: "vk-connect"` envelope; receive side listens to `message`
 * - WebViews receive via `CustomEvent("VKWebAppEvent")`
 *
 * The wire format is the platform interface — the host clients on the other
 * side of these bridges define it, which is why the envelopes above are
 * reproduced exactly.
 */

import { createTap, type BridgeTap, type BridgeTapEvent } from "./tap.ts";
import type { SendOptions, VKBridgeSend, VKBridgeSubscribeHandler, VkmaBridge } from "./types.ts";

/** Methods supported on the desktop web hosts. */
const DESKTOP_METHODS = new Set([
	"VKWebAppInit",
	"VKWebAppGetCommunityAuthToken",
	"VKWebAppAddToCommunity",
	"VKWebAppAddToHomeScreenInfo",
	"VKWebAppClose",
	"VKWebAppCopyText",
	"VKWebAppCreateHash",
	"VKWebAppGetUserInfo",
	"VKWebAppSetLocation",
	"VKWebAppSendToClient",
	"VKWebAppGetClientVersion",
	"VKWebAppGetPhoneNumber",
	"VKWebAppGetEmail",
	"VKWebAppGetGroupInfo",
	"VKWebAppGetGeodata",
	"VKWebAppGetCommunityToken",
	"VKWebAppGetConfig",
	"VKWebAppGetLaunchParams",
	"VKWebAppSetTitle",
	"VKWebAppGetAuthToken",
	"VKWebAppCallAPIMethod",
	"VKWebAppJoinGroup",
	"VKWebAppLeaveGroup",
	"VKWebAppAllowMessagesFromGroup",
	"VKWebAppDenyNotifications",
	"VKWebAppAllowNotifications",
	"VKWebAppOpenPayForm",
	"VKWebAppOpenApp",
	"VKWebAppShare",
	"VKWebAppShowWallPostBox",
	"VKWebAppScroll",
	"VKWebAppShowOrderBox",
	"VKWebAppShowLeaderBoardBox",
	"VKWebAppShowInviteBox",
	"VKWebAppShowRequestBox",
	"VKWebAppAddToFavorites",
	"VKWebAppShowStoryBox",
	"VKWebAppStorageGet",
	"VKWebAppStorageGetKeys",
	"VKWebAppStorageSet",
	"VKWebAppFlashGetInfo",
	"VKWebAppSubscribeStoryApp",
	"VKWebAppOpenWallPost",
	"VKWebAppCheckAllowedScopes",
	"VKWebAppCheckBannerAd",
	"VKWebAppHideBannerAd",
	"VKWebAppShowBannerAd",
	"VKWebAppCheckNativeAds",
	"VKWebAppShowNativeAds",
	"VKWebAppRetargetingPixel",
	"VKWebAppConversionHit",
	"VKWebAppShowSubscriptionBox",
	"VKWebAppCheckSurvey",
	"VKWebAppShowSurvey",
	"VKWebAppScrollTop",
	"VKWebAppScrollTopStart",
	"VKWebAppScrollTopStop",
	"VKWebAppShowSlidesSheet",
	"VKWebAppTranslate",
	"VKWebAppRecommend",
	"VKWebAppAddToProfile",
	"VKWebAppGetFriends",
	// Desktop web specific events
	...(isDesktopVk()
		? [
				"VKWebAppResizeWindow",
				"VKWebAppAddToMenu",
				"VKWebAppShowInstallPushBox",
				"VKWebAppShowCommunityWidgetPreviewBox",
				"VKWebAppCallStart",
				"VKWebAppCallJoin",
				"VKWebAppCallGetStatus",
			]
		: ["VKWebAppShowImages"]),
]);

// ------------------------------------------------------------- environment

function clientWindow(): (Window & typeof globalThis) | undefined {
	return typeof window === "undefined" ? undefined : window;
}

/**
 * The native side of the host (AndroidBridge / webkit / ReactNativeWebView)
 * lives on the window but is not part of any DOM typing — tests install
 * fakes under the same keys.
 */
function hostGlobal(): Record<string, unknown> | undefined {
	const win = clientWindow();
	return win === undefined ? undefined : (win as unknown as Record<string, unknown>);
}

export function isClientSide(): boolean {
	return typeof window !== "undefined";
}

export function isAndroidWebview(): boolean {
	return Boolean(hostGlobal()?.["AndroidBridge"]);
}

export function isIosWebview(): boolean {
	const webkit = hostGlobal()?.["webkit"] as
		| { messageHandlers?: Record<string, { postMessage?: unknown }> }
		| undefined;
	return Boolean(webkit?.messageHandlers?.["VKWebAppClose"]);
}

export function isReactNativeWebview(): boolean {
	const reactNative = hostGlobal()?.["ReactNativeWebView"] as
		| { postMessage?: unknown }
		| undefined;
	return Boolean(reactNative && typeof reactNative.postMessage === "function");
}

export function isWeb(): boolean {
	return isClientSide() && !isAndroidWebview() && !isIosWebview();
}

export function isMvk(): boolean {
	return (
		isWeb() && /(^\?|&)vk_platform=mobile_web(&|$)/.test(clientWindow()?.location.search ?? "")
	);
}

export function isDesktopVk(): boolean {
	return isWeb() && !isMvk();
}

// -------------------------------------------------------------- the bridge

/**
 * request_id policy of a bridge instance.
 */
export interface RequestIdPolicy {
	/**
	 * Own generator of outgoing request ids; receives an incrementing
	 * sequence. The default mints `__vkma_<n>` — the ids the devtools tap
	 * pairs responses by.
	 */
	generator?: (sequence: number) => string | number;
	/**
	 * Turn the auto-injection off: sends pass caller props untouched, so
	 * promise pairing only works for calls that provide their own
	 * `request_id`. Default: on.
	 */
	inject?: boolean;
}

export interface VkmaBridgeOptions {
	/** Outgoing request_id policy. */
	requestId?: RequestIdPolicy;
	/** Inject a shared tap (the default instance passes the page-wide one). */
	tap?: BridgeTap;
	/** Version string reported to the web host in the vk-connect envelope. */
	version?: string;
}

interface PendingRequest {
	resolve: (value: unknown) => void;
	reject: (reason: unknown) => void;
	tapId: number;
	options: SendOptions;
	cleanup: () => void;
}

/**
 * Creates a VK Bridge instance: transport dispatch, subscription fan-out,
 * promise pairing and the always-on tap.
 *
 * @param version Version of the package (reported to the web host).
 * @param [options] Tap sharing and the request_id policy.
 */
export function createVKBridge(version: string, options: VkmaBridgeOptions = {}): VkmaBridge {
	const tap = options.tap ?? createTap();
	const requestIdPolicy = options.requestId ?? {};

	/** Current frame id, assigned by the host via VKWebAppSettings. */
	let webFrameId: string | undefined;

	/** Functions subscribed to bridge events. */
	const subscribers: VKBridgeSubscribeHandler[] = [];

	/** Pending promise controllers by outgoing request_id. */
	const pendingRequests = new Map<string, PendingRequest>();

	let requestCounter = 0;
	let supportedHandlers: Set<string> | undefined;

	const isPlainObject = (value: unknown): value is Record<string, unknown> =>
		typeof value === "object" && value !== null;

	// ------------------------------------------------------------- transports

	function sendThroughTransport(method: string, props: Record<string, unknown>): void {
		const host = hostGlobal();
		const android = host?.["AndroidBridge"] as
			| Record<string, ((serializedData: string) => void) | undefined>
			| undefined;
		// Sending data through the Android bridge
		if (typeof android?.[method] === "function") {
			android[method](JSON.stringify(props));
			return;
		}

		const iosHandlers = (
			host?.["webkit"] as
				| { messageHandlers?: Record<string, { postMessage?: unknown }> }
				| undefined
		)?.messageHandlers;
		// Sending data through the iOS bridge
		if (typeof iosHandlers?.[method]?.postMessage === "function") {
			// Not a window.postMessage — the native handler takes no targetOrigin.
			// oxlint-disable-next-line unicorn/require-post-message-target-origin
			(iosHandlers[method].postMessage as (data: unknown) => void)(props);
			return;
		}

		// Sending data through the React Native bridge
		if (isReactNativeWebview()) {
			const reactNative = host?.["ReactNativeWebView"] as {
				postMessage: (data: string) => void;
			};
			// Not a window.postMessage — the RN handler takes no targetOrigin.
			// oxlint-disable-next-line unicorn/require-post-message-target-origin
			reactNative.postMessage(JSON.stringify({ handler: method, params: props }));
			return;
		}

		// Sending data through the web bridge (the parent frame)
		const win = clientWindow();
		const parent = win?.parent;
		if (win && parent && typeof parent.postMessage === "function") {
			// The mini app does not know the host origin ahead of time (vk.ru,
			// m.vk.ru, mobile clients) — "*" is the wire contract here.
			// oxlint-disable-next-line unicorn/require-post-message-target-origin
			parent.postMessage(
				{
					handler: method,
					params: props,
					type: "vk-connect",
					webFrameId,
					connectVersion: version,
				},
				"*",
			);
		}
	}

	// ------------------------------------------------------------- event intake

	function handleEvent(event: unknown): void {
		if (isIosWebview() || isAndroidWebview()) {
			// WebViews: the native layer dispatches ready-made events
			deliver(event as { detail?: { type?: unknown; data?: unknown } });
			return;
		}

		let bridgeEventData = (event as { data?: unknown } | undefined)?.data;
		if (!isWeb() || !bridgeEventData) {
			return;
		}

		if (isReactNativeWebview() && typeof bridgeEventData === "string") {
			try {
				bridgeEventData = JSON.parse(bridgeEventData) as unknown;
			} catch {}
		}

		if (!isPlainObject(bridgeEventData)) {
			return;
		}
		const { type, data, frameId } = bridgeEventData as {
			type?: unknown;
			data?: unknown;
			frameId?: unknown;
		};
		if (!type) {
			return;
		}

		// The host assigns this iframe its frame id — internal protocol,
		// not delivered to subscribers.
		if (type === "VKWebAppSettings") {
			webFrameId = typeof frameId === "string" ? frameId : webFrameId;
			return;
		}

		deliver({ detail: { type, data } });
	}

	/**
	 * Upstream parity: every incoming event reaches `[...subscribers]` —
	 * paired responses included, with the raw wire data (upstream's
	 * promisifySend is itself a subscriber and strips request_id only for
	 * the promise). Snapshot iteration: a handler may unsubscribe mid-fan.
	 */
	function fanOutToSubscribers(type: string, data: unknown): void {
		// The wire type is stringly here by design — handleEvent dispatches
		// arbitrary host envelopes; the public subscribe surface narrows it.
		// The slice is a snapshot: a handler may unsubscribe mid-fan-out,
		// and shifting live iteration would skip its neighbours (upstream
		// copies the array for the same reason).
		const out = { detail: { type, data } } as Parameters<VKBridgeSubscribeHandler>[0];
		for (const listener of subscribers.slice()) {
			listener(out);
		}
	}

	/** Fan an incoming event out to the tap and to the subscribers. */
	function deliver(event: { detail?: { type?: unknown; data?: unknown } }): void {
		const { type, data } = event.detail ?? {};
		if (typeof type !== "string") {
			return;
		}

		// A payload carrying one of our pending request ids is the paired
		// response to a send; everything else is an unsolicited event.
		// The wire contract types request_id as a string or a number.
		if (isPlainObject(data)) {
			const wireRequestId = data["request_id"];
			if (typeof wireRequestId !== "string" && typeof wireRequestId !== "number") {
				tap.emit({ direction: "in", kind: "event", name: type, payload: data });
				fanOutToSubscribers(type, data);
				return;
			}
			const requestId = String(wireRequestId);
			const pending = pendingRequests.get(requestId);
			if (pending) {
				pendingRequests.delete(requestId);
				const { request_id: _stripped, ...payload } = data;
				const ok = !("error_type" in data);
				pending.cleanup();
				tap.emit({
					direction: "in",
					kind: "response",
					name: type,
					payload,
					reqId: pending.tapId,
					ok,
				});
				if (ok) {
					pending.resolve(payload);
				} else {
					pending.reject(payload);
				}
				// After the pairing listener's job (the promise is settled
				// already, like upstream's first-registered pairing handler).
				fanOutToSubscribers(type, data);
				return;
			}
		}

		tap.emit({ direction: "in", kind: "event", name: type, payload: data });
		fanOutToSubscribers(type, data);
	}

	function subscribe(listener: VKBridgeSubscribeHandler): void {
		subscribers.push(listener);
	}

	function unsubscribe(listener: VKBridgeSubscribeHandler): void {
		const index = subscribers.indexOf(listener);
		if (index > -1) {
			subscribers.splice(index, 1);
		}
	}

	// Listening for messages from the runtime env. React Native on Android
	// dispatches on the document, everything else on the window.
	if (isClientSide()) {
		const win = clientWindow();
		if (isReactNativeWebview() && /(android)/i.test(win?.navigator.userAgent ?? "")) {
			document.addEventListener("message", handleEvent);
		} else if (win && "addEventListener" in win) {
			win.addEventListener(isWeb() ? "message" : "VKWebAppEvent", handleEvent);
		}
	}

	// ------------------------------------------------------------ send + tap

	const send: VKBridgeSend = ((
		method: string,
		props?: Record<string, unknown>,
		sendOptions?: SendOptions,
	) => {
		return new Promise((resolve, reject) => {
			const signal = sendOptions?.signal;
			// A pre-aborted signal rejects before anything happens: no wire
			// send, no tap entry, no pending slot (the tap reflects reality).
			if (signal?.aborted) {
				const error = new Error(`VK Bridge send "${method}" aborted`);
				error.name = "AbortError";
				reject(error);
				return;
			}

			const sourceProps: Record<string, unknown> = { ...props };
			const explicitId =
				typeof sourceProps["request_id"] === "string" ||
				typeof sourceProps["request_id"] === "number"
					? sourceProps["request_id"]
					: undefined;
			let requestId: string | number | undefined;
			if (explicitId !== undefined) {
				requestId = explicitId;
			} else if (requestIdPolicy.inject !== false) {
				const sequence = ++requestCounter;
				requestId = requestIdPolicy.generator
					? requestIdPolicy.generator(sequence)
					: `__vkma_${sequence}`;
			}

			// The wire props are a separate object: the tap payload must not
			// mutate under a listener that observed the emit.
			const wireProps =
				requestId === undefined ? sourceProps : { ...sourceProps, request_id: requestId };

			const tapId = tap.emit({
				direction: "out",
				kind: "send",
				name: method,
				payload: wireProps,
			});

			let timer: ReturnType<typeof setTimeout> | undefined;
			let signalHandler: (() => void) | undefined;

			const cleanup = (): void => {
				if (timer !== undefined) {
					clearTimeout(timer);
				}
				if (signal && signalHandler) {
					signal.removeEventListener("abort", signalHandler);
				}
			};

			// Timeout and abort must fire even for unpaired sends (no
			// pending slot to consult — e.g. inject: false without a caller
			// request_id): the caller asked for a bounded call. For paired
			// sends the pending entry doubles as the "already answered"
			// guard against a double rejection.
			const timeoutReject = (): void => {
				if (requestId !== undefined && !pendingRequests.delete(String(requestId))) {
					return;
				}
				cleanup();
				const error = new Error(
					`VK Bridge send "${method}" timed out after ${String(sendOptions?.timeout)}ms`,
				);
				error.name = "TimeoutError";
				reject(error);
			};

			const abortReject = (): void => {
				if (requestId !== undefined && !pendingRequests.delete(String(requestId))) {
					return;
				}
				cleanup();
				const error = new Error(`VK Bridge send "${method}" aborted`);
				error.name = "AbortError";
				reject(error);
			};

			if (requestId !== undefined) {
				pendingRequests.set(String(requestId), {
					resolve: resolve as (value: unknown) => void,
					reject,
					tapId,
					options: sendOptions ?? {},
					cleanup,
				});
			}

			if (sendOptions?.timeout !== undefined) {
				timer = setTimeout(timeoutReject, sendOptions.timeout);
			}
			if (signal) {
				signalHandler = abortReject;
				signal.addEventListener("abort", signalHandler);
			}

			sendThroughTransport(method, wireProps);
		});
	}) as VKBridgeSend;

	// The cache behind supportsAsync, fed by both the SetSupportedHandlers
	// response and the unsolicited pushes of the same name.
	subscribe((event: { detail?: { type?: unknown; data?: unknown } }) => {
		if (event.detail?.type === "SetSupportedHandlers" && isPlainObject(event.detail.data)) {
			const handlers = (event.detail.data as { supportedHandlers?: unknown })
				.supportedHandlers;
			if (Array.isArray(handlers)) {
				supportedHandlers = new Set(
					handlers.filter((name): name is string => typeof name === "string"),
				);
			}
		}
	});

	function supportsInner(method: string): boolean {
		if (isAndroidWebview()) {
			const android = hostGlobal()?.["AndroidBridge"] as
				| Record<string, ((serializedData: string) => void) | undefined>
				| undefined;
			return typeof android?.[method] === "function";
		}
		if (isIosWebview()) {
			const handlers = (
				hostGlobal()?.["webkit"] as
					| { messageHandlers?: Record<string, { postMessage?: unknown }> }
					| undefined
			)?.messageHandlers;
			return typeof handlers?.[method]?.postMessage === "function";
		}
		if (isWeb()) {
			return DESKTOP_METHODS.has(method);
		}
		return false;
	}

	const bridge: VkmaBridge = {
		send,
		sendPromise: send,
		subscribe,
		unsubscribe,
		supports: (method: string) => {
			console.warn("bridge.supports method is deprecated. Use bridge.supportsAsync instead.");
			return supportsInner(method);
		},
		supportsAsync: async (method: string) => {
			if (isAndroidWebview() || isIosWebview()) {
				return supportsInner(method);
			}
			if (supportedHandlers) {
				return supportedHandlers.has(method);
			}
			try {
				const response = (await send("SetSupportedHandlers")) as {
					supportedHandlers?: string[];
				};
				supportedHandlers = new Set(response.supportedHandlers ?? ["VKWebAppInit"]);
			} catch {
				supportedHandlers = new Set(["VKWebAppInit"]);
			}
			return supportedHandlers.has(method);
		},
		isWebView: () => isIosWebview() || isAndroidWebview(),
		isIframe: () => {
			const win = clientWindow();
			return Boolean(win && win.parent !== win);
		},
		isEmbedded: () => bridge.isWebView() || bridge.isIframe(),
		isStandalone: () => !bridge.isEmbedded(),
		tap,
		onSend: listener =>
			tap.subscribe(event => {
				if (event.direction === "out") {
					listener(event as BridgeTapEvent & { direction: "out" });
				}
			}),
		onEvent: listener =>
			tap.subscribe(event => {
				if (event.direction === "in") {
					listener(event as BridgeTapEvent & { direction: "in" });
				}
			}),
	};

	return bridge;
}
