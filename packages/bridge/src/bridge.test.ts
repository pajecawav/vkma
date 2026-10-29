import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createVKBridge } from "./bridge.js";
import { createTap } from "./tap.js";

/**
 * The tests drive a real bridge against a faked host: web transports get a
 * fake `window.parent`, mobile transports get faked native bridge objects.
 * The native-object semantics follow the platform contracts (Android takes a
 * JSON string, iOS posts the object as-is, RN wraps into { handler, params }).
 */

interface Harness {
	bridge: ReturnType<typeof createVKBridge>;
	parentPostMessage: ReturnType<typeof vi.fn>;
	/** The host → app direction: a web message from the parent frame. */
	respond: (type: string, data: unknown, requestId?: string) => void;
}

function createHarness(options?: Parameters<typeof createVKBridge>[1]): Harness {
	const parentPostMessage = vi.fn();
	Object.defineProperty(window, "parent", {
		value: { postMessage: parentPostMessage },
		configurable: true,
	});
	const bridge = createVKBridge("test-version", options);
	return {
		bridge,
		parentPostMessage,
		respond(type, data, requestId) {
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type,
						data:
							requestId === undefined
								? data
								: { ...(data as object), request_id: requestId },
						frameId: "frame-1",
					},
				}),
			);
		},
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	const win = window as unknown as Record<string, unknown>;
	delete win["AndroidBridge"];
	delete win["webkit"];
	delete win["ReactNativeWebView"];
	Object.defineProperty(window, "parent", { value: window, configurable: true });
});

describe("web transport", () => {
	test("send posts the vk-connect envelope to the parent with an injected request_id", async () => {
		const { bridge, parentPostMessage } = createHarness();
		const promise = bridge.send("VKWebAppSetLocation", { location: "profile" });

		expect(parentPostMessage).toHaveBeenCalledTimes(1);
		const [envelope, targetOrigin] = parentPostMessage.mock.calls[0] as [
			Record<string, unknown>,
			string,
		];
		expect(envelope["handler"]).toBe("VKWebAppSetLocation");
		expect(envelope["params"]).toEqual({ location: "profile", request_id: "__vkma_1" });
		expect(envelope["type"]).toBe("vk-connect");
		expect(envelope["connectVersion"]).toBe("test-version");
		expect(targetOrigin).toBe("*");

		// The host echoes request_id back; the promise resolves with the
		// payload stripped of it.
		const responded = expect(promise).resolves.toEqual({ result: true });
		window.dispatchEvent(
			new MessageEvent("message", {
				data: {
					type: "VKWebAppSetLocationResult",
					data: { result: true, request_id: "__vkma_1" },
				},
			}),
		);
		await responded;
	});

	test("error responses reject the promise and mark the tap event failed", async () => {
		const { bridge, respond } = createHarness();
		const promise = bridge.send("VKWebAppGetUserInfo");
		const assertion = expect(promise).rejects.toMatchObject({
			error_type: "api_error",
		});
		respond("VKWebAppGetUserInfoFailed", {
			error_type: "api_error",
			error_data: { error_code: 1, error_msg: "boom", request_params: [] },
			request_id: "__vkma_1",
		});
		await assertion;

		const response = bridge.tap.drain().find(event => event.kind === "response");
		expect(response?.ok).toBe(false);
		expect(response?.reqId).toBeDefined();
	});

	test("unsolicited events stream as kind: event", () => {
		const { bridge, respond } = createHarness();
		respond("VKWebAppUpdateConfig", {
			app_id: "1",
			appearance: "light",
			scheme: "bright_light",
		});
		const event = bridge.tap.drain().at(-1);
		expect(event).toMatchObject({
			direction: "in",
			kind: "event",
			name: "VKWebAppUpdateConfig",
		});
	});

	test("VKWebAppSettings assigns the web frame id, later envelopes carry it", () => {
		const parentPostMessage = vi.fn();
		Object.defineProperty(window, "parent", {
			value: { postMessage: parentPostMessage },
			configurable: true,
		});
		// The listener must exist before the host assigns the frame id.
		const bridge = createVKBridge("test-version");
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { type: "VKWebAppSettings", frameId: "frame-42" },
			}),
		);
		void bridge.send("VKWebAppInit");
		const envelope = parentPostMessage.mock.calls.at(-1)?.[0] as Record<string, unknown>;
		expect(envelope["webFrameId"]).toBe("frame-42");
	});
});

describe("request_id policy", () => {
	test("a caller-supplied request_id is honored", async () => {
		const { bridge, parentPostMessage } = createHarness();
		const promise = bridge.send("VKWebAppStorageSet", {
			key: "a",
			value: "b",
			request_id: "mine",
		});
		const envelope = parentPostMessage.mock.calls[0]?.[0] as {
			params: Record<string, unknown>;
		};
		expect(envelope["params"]["request_id"]).toBe("mine");
		const responded = expect(promise).resolves.toEqual({ result: true });
		window.dispatchEvent(
			new MessageEvent("message", {
				data: {
					type: "VKWebAppStorageSetResult",
					data: { result: true, request_id: "mine" },
				},
			}),
		);
		await responded;
	});

	test("inject: false leaves the props untouched", () => {
		const { bridge, parentPostMessage } = createHarness({ requestId: { inject: false } });
		void bridge.send("VKWebAppCopyText", { text: "hi" });
		const envelope = parentPostMessage.mock.calls[0]?.[0] as {
			params: Record<string, unknown>;
		};
		expect(envelope["params"]["request_id"]).toBeUndefined();
	});

	test("a custom generator replaces the default __vkma_ ids", () => {
		const { bridge, parentPostMessage } = createHarness({
			requestId: { generator: sequence => `custom-${sequence}` },
		});
		void bridge.send("VKWebAppCopyText", { text: "hi" });
		const envelope = parentPostMessage.mock.calls[0]?.[0] as {
			params: Record<string, unknown>;
		};
		expect(envelope["params"]["request_id"]).toBe("custom-1");
	});
});

describe("timeout and abort", () => {
	test("send rejects with TimeoutError when no response arrives", async () => {
		vi.useFakeTimers();
		try {
			const { bridge } = createHarness();
			const promise = bridge.send("VKWebAppGetUserInfo", undefined, { timeout: 1000 });
			const assertion = expect(promise).rejects.toMatchObject({ name: "TimeoutError" });
			await vi.advanceTimersByTimeAsync(1001);
			await assertion;
		} finally {
			vi.useRealTimers();
		}
	});

	test("send rejects with AbortError when the signal aborts", async () => {
		const { bridge } = createHarness();
		const controller = new AbortController();
		const promise = bridge.send("VKWebAppGetUserInfo", undefined, {
			signal: controller.signal,
		});
		const assertion = expect(promise).rejects.toMatchObject({ name: "AbortError" });
		controller.abort();
		await assertion;
	});

	test("a late response after a timeout does not resolve the dead promise", async () => {
		vi.useFakeTimers();
		try {
			const { bridge } = createHarness();
			const promise = bridge.send("VKWebAppGetUserInfo", undefined, { timeout: 100 });
			const assertion = expect(promise).rejects.toMatchObject({ name: "TimeoutError" });
			await vi.advanceTimersByTimeAsync(101);
			await assertion;
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "VKWebAppGetUserInfoResult",
						data: { id: 1, request_id: "__vkma_1" },
					},
				}),
			);
		} finally {
			vi.useRealTimers();
		}
	});

	test("timeout rejects even for unpaired sends (inject: false)", async () => {
		vi.useFakeTimers();
		try {
			const { bridge } = createHarness({ requestId: { inject: false } });
			const promise = bridge.send("VKWebAppGetUserInfo", undefined, { timeout: 1000 });
			const assertion = expect(promise).rejects.toMatchObject({ name: "TimeoutError" });
			await vi.advanceTimersByTimeAsync(1001);
			await assertion;
		} finally {
			vi.useRealTimers();
		}
	});

	test("abort rejects even for unpaired sends (inject: false)", async () => {
		const { bridge } = createHarness({ requestId: { inject: false } });
		const controller = new AbortController();
		const promise = bridge.send("VKWebAppGetUserInfo", undefined, {
			signal: controller.signal,
		});
		const assertion = expect(promise).rejects.toMatchObject({ name: "AbortError" });
		controller.abort();
		await assertion;
	});

	test("a pre-aborted signal rejects without a tap send", async () => {
		const tap = createTap();
		const { bridge } = createHarness({ tap });
		const seen: Array<{ direction: string }> = [];
		tap.subscribe(event => seen.push({ direction: event.direction }));

		const controller = new AbortController();
		controller.abort();
		await expect(
			bridge.send("VKWebAppGetUserInfo", undefined, { signal: controller.signal }),
		).rejects.toMatchObject({ name: "AbortError" });

		// Nothing touched the wire — the tap must reflect that.
		expect(seen).toEqual([]);
	});
});

describe("native transports", () => {
	test("android bridge receives a JSON string", () => {
		const androidSend = vi.fn();
		const winA = window as unknown as Record<string, unknown>;
		winA["AndroidBridge"] = { VKWebAppSetLocation: androidSend };
		const bridge = createVKBridge("test-version");
		void bridge.send("VKWebAppSetLocation", { location: "x" });
		expect(androidSend).toHaveBeenCalledWith(
			JSON.stringify({ location: "x", request_id: "__vkma_1" }),
		);

		// WebView responses arrive as CustomEvents with a ready detail.
		const responded = expect(bridge.send("VKWebAppInit")).resolves.toEqual({ result: true });
		window.dispatchEvent(
			new CustomEvent("VKWebAppEvent", {
				detail: {
					type: "VKWebAppInitResult",
					data: { result: true, request_id: "__vkma_2" },
				},
			}),
		);
		return responded;
	});

	test("ios bridge receives the props object as-is", () => {
		const iosSend = vi.fn();
		const winI = window as unknown as Record<string, unknown>;
		winI["webkit"] = {
			messageHandlers: { VKWebAppInit: { postMessage: iosSend } },
		};
		const bridge = createVKBridge("test-version");
		void bridge.send("VKWebAppInit");
		expect(iosSend).toHaveBeenCalledWith({ request_id: "__vkma_1" });
	});

	test("react native bridge wraps into { handler, params }", () => {
		const rnSend = vi.fn();
		const winR = window as unknown as Record<string, unknown>;
		winR["ReactNativeWebView"] = { postMessage: rnSend };
		const bridge = createVKBridge("test-version");
		void bridge.send("VKWebAppCopyText", { text: "hi" });
		expect(rnSend).toHaveBeenCalledWith(
			JSON.stringify({
				handler: "VKWebAppCopyText",
				params: { text: "hi", request_id: "__vkma_1" },
			}),
		);
	});
});

describe("supports", () => {
	test("web support follows the desktop method list", async () => {
		const { bridge, respond } = createHarness();
		expect(bridge.supports("VKWebAppInit")).toBe(true);
		expect(bridge.supports("VKWebAppResizeWindow")).toBe(true); // desktop vk host
		expect(bridge.supports("VKWebAppOpenCodeReader")).toBe(false);
		const supported = bridge.supportsAsync("VKWebAppInit");
		respond("SetSupportedHandlers", { supportedHandlers: ["VKWebAppInit"] }, "__vkma_1");
		expect(await supported).toBe(true);
	});

	test("supportsAsync falls back to the SetSupportedHandlers round trip", async () => {
		const { bridge, respond } = createHarness();
		const promise = bridge.supportsAsync("VKWebAppOpenCodeReader");
		respond(
			"SetSupportedHandlers",
			{ supportedHandlers: ["VKWebAppInit", "VKWebAppOpenCodeReader"] },
			"__vkma_1",
		);
		expect(await promise).toBe(true);
	});
});

describe("tap subscriptions", () => {
	test("onSend sees outgoing, onEvent sees incoming", () => {
		const tap = createTap();
		const { bridge, respond } = createHarness({ tap });
		const sent: string[] = [];
		const incoming: string[] = [];
		bridge.onSend(event => sent.push(event.name));
		bridge.onEvent(event => incoming.push(event.name));

		void bridge.send("VKWebAppGetUserInfo");
		respond("VKWebAppGetUserInfoResult", { id: 1, request_id: "__vkma_1" });
		respond("VKWebAppUpdateInsets", { insets: { top: 0, left: 0, right: 0, bottom: 0 } });

		expect(sent).toEqual(["VKWebAppGetUserInfo"]);
		expect(incoming).toEqual(["VKWebAppGetUserInfoResult", "VKWebAppUpdateInsets"]);
	});
});

describe("subscribe fan-out", () => {
	test("unsolicited events reach subscribers", () => {
		const { bridge, respond } = createHarness();
		const seen: Array<{ type?: unknown; data?: unknown }> = [];
		bridge.subscribe(event =>
			seen.push({ type: event.detail?.type, data: event.detail?.data }),
		);

		respond("VKWebAppUpdateInsets", { insets: { top: 1, left: 0, right: 0, bottom: 0 } });

		expect(seen).toEqual([
			{
				type: "VKWebAppUpdateInsets",
				data: { insets: { top: 1, left: 0, right: 0, bottom: 0 } },
			},
		]);
	});

	test("paired responses reach subscribers with the raw data, the promise strips request_id", async () => {
		const { bridge, respond } = createHarness();
		const seen: Array<Record<string, unknown> | undefined> = [];
		bridge.subscribe(event => seen.push(event.detail?.data as Record<string, unknown>));

		const promise = bridge.send("VKWebAppGetUserInfo");
		respond("VKWebAppGetUserInfoResult", { id: 1 }, "__vkma_1");

		// Upstream parity: promisifySend is itself a subscriber, so user
		// handlers observe the wire event as-is — request_id not yet
		// stripped; only the promise resolution strips it.
		expect(await promise).toEqual({ id: 1 });
		expect(seen).toEqual([{ id: 1, request_id: "__vkma_1" }]);
	});

	test("unsubscribe stops the delivery", () => {
		const { bridge, respond } = createHarness();
		const seen: string[] = [];
		const handler = (event: { detail?: { type?: unknown } }): void => {
			seen.push(String(event.detail?.type));
		};

		bridge.subscribe(handler);
		respond("VKWebAppUpdateConfig", { scheme: "space_gray" });
		bridge.unsubscribe(handler);
		respond("VKWebAppViewRestore", {});

		expect(seen).toEqual(["VKWebAppUpdateConfig"]);
	});

	test("subscribe returns its own unsubscribe", () => {
		const { bridge, respond } = createHarness();
		const seen: string[] = [];
		const off = bridge.subscribe(event => {
			seen.push(String(event.detail?.type));
		});

		respond("VKWebAppUpdateConfig", { scheme: "space_gray" });
		off();
		respond("VKWebAppViewRestore", {});

		expect(seen).toEqual(["VKWebAppUpdateConfig"]);
	});

	test("VKWebAppSettings never reaches subscribers", () => {
		const { bridge, respond } = createHarness();
		const seen: Array<string | undefined> = [];
		bridge.subscribe(event => seen.push(event.detail?.type));

		respond("VKWebAppSettings", {});

		expect(seen).toEqual([]);
	});

	test("supportsAsync refreshes its cache from unsolicited SetSupportedHandlers pushes", async () => {
		const { bridge, parentPostMessage, respond } = createHarness();

		const first = bridge.supportsAsync("VKWebAppOpenCodeReader");
		respond("SetSupportedHandlers", { supportedHandlers: ["VKWebAppInit"] }, "__vkma_1");
		expect(await first).toBe(false);

		// An unsolicited push (no request_id — the host volunteered it).
		respond("SetSupportedHandlers", {
			supportedHandlers: ["VKWebAppInit", "VKWebAppOpenCodeReader"],
		});
		const roundTrips = parentPostMessage.mock.calls.length;
		expect(await bridge.supportsAsync("VKWebAppOpenCodeReader")).toBe(true);
		// Answered from the refreshed cache — no new round trip.
		expect(parentPostMessage.mock.calls.length).toBe(roundTrips);
	});
});
