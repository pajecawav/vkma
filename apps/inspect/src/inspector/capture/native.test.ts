import { afterEach, describe, expect, it } from "vitest";
import { installNativeCapture } from "./native.ts";

/**
 * The native wraps against fakes, the happy-dom stand-ins for what the
 * VK webview injects. The contract under test: FORWARD FIRST (the page
 * must behave as if we were never there), then report; and both an
 * already-captured reference (in-place mutation) and a fresh reader
 * (the window-level Proxy) see the wrap.
 *
 * Two Android fakes. A plain object stands for a surface where the
 * in-place write sticks; `injectedAndroidBridge()` stands for the
 * WebView itself, whose named-property interceptor serves the reads
 * whatever an own-property write says.
 */

type BridgeWindow = {
	AndroidBridge?: Record<string, unknown>;
	webkit?: { messageHandlers?: Record<string, unknown> };
};

const bridgeWindow = (): BridgeWindow => window as unknown as BridgeWindow;

const android = (): Record<string, (serialized: string) => unknown> =>
	bridgeWindow().AndroidBridge as Record<string, (serialized: string) => unknown>;

/** The WebView's injected object: a read returns the native method even
 * after an own-property write (the native setter declines), and the
 * method accepts only the object itself as its receiver. */
function injectedAndroidBridge(): Record<string, (serialized: string) => unknown> {
	const bridge: Record<string, (serialized: string) => unknown> = {};
	const method = function (this: unknown, serialized: string): string {
		if (this !== bridge) {
			throw new Error("Java bridge method can't be invoked on a non-injected object");
		}
		return `native:${serialized}`;
	};
	Object.defineProperty(bridge, "VKWebAppInit", {
		get: () => method,
		set: () => {},
		enumerable: true,
		configurable: true,
	});
	return bridge;
}

afterEach(() => {
	delete bridgeWindow().AndroidBridge;
	delete bridgeWindow().webkit;
});

describe("installNativeCapture", () => {
	it("forwards Android calls first, then reports them", () => {
		const forwarded: string[] = [];
		const calls: { name: string; params: Record<string, unknown> }[] = [];
		bridgeWindow().AndroidBridge = {
			VKWebAppGetUserInfo: (serialized: string) => {
				forwarded.push(serialized);
				return "native-result";
			},
		};

		expect(installNativeCapture(call => calls.push(call))).toBe(true);
		const result = android()["VKWebAppGetUserInfo"]?.(JSON.stringify({ user_id: 1 }));

		expect(result).toBe("native-result"); // forwarded to the real handler
		expect(forwarded).toEqual([JSON.stringify({ user_id: 1 })]); // untouched wire data
		expect(calls).toEqual([{ name: "VKWebAppGetUserInfo", params: { user_id: 1 } }]);
	});

	it("an already-captured reference sees the wrap (in-place mutation)", () => {
		const calls: string[] = [];
		bridgeWindow().AndroidBridge = {
			VKWebAppRun: (serialized: string) => `ran:${serialized}`,
		};
		// the app's bridge module captured this BEFORE the inspector loaded
		const captured = android();

		installNativeCapture(call => calls.push(call.name));
		captured["VKWebAppRun"]?.(JSON.stringify({}));

		expect(calls).toEqual(["VKWebAppRun"]);
	});

	it("a handler the native side adds later gets wrapped on first read", () => {
		const calls: string[] = [];
		const original: Record<string, (serialized: string) => void> = {
			VKWebAppRun: () => {},
		};
		bridgeWindow().AndroidBridge = original;
		installNativeCapture(call => calls.push(call.name));

		original["VKWebAppNewThing"] = () => {}; // added after the inspector
		android()["VKWebAppNewThing"]?.(JSON.stringify({ request_id: "9" }));

		expect(calls).toEqual(["VKWebAppNewThing"]);
	});

	it("a call through window.AndroidBridge works when the in-place write is shadowed", () => {
		const calls: { name: string; params: Record<string, unknown> }[] = [];
		bridgeWindow().AndroidBridge = injectedAndroidBridge();
		installNativeCapture(call => calls.push(call));

		// vk-bridge's shape: the object is read, the method called on it
		const result = android()["VKWebAppInit"]?.(JSON.stringify({ a: 1 }));

		expect(result).toBe('native:{"a":1}');
		expect(calls).toEqual([{ name: "VKWebAppInit", params: { a: 1 } }]);
	});

	it("an inherited Object.prototype member is not planted on the host's object", () => {
		bridgeWindow().AndroidBridge = injectedAndroidBridge();
		installNativeCapture(() => {});

		const bridge = android();
		void bridge["hasOwnProperty"];
		void bridge["toString"];

		expect(Object.keys(bridge)).toEqual(["VKWebAppInit"]);
		expect(Object.prototype.hasOwnProperty.call(bridge, "hasOwnProperty")).toBe(false);
	});

	it("never touches constructor or dunder members", () => {
		const calls: string[] = [];
		bridgeWindow().AndroidBridge = {
			VKWebAppRun: () => {},
			__internal: (serialized: string) => serialized,
		};
		installNativeCapture(call => calls.push(call.name));

		expect(() => {
			android()["__internal"]?.("{}");
		}).not.toThrow();
		expect(calls).toEqual([]);
	});

	it("wraps iOS message handlers: postMessage forwards, then reports", () => {
		const forwarded: unknown[] = [];
		const calls: { name: string; params: Record<string, unknown> }[] = [];
		const handlers: Record<string, { postMessage: (data: unknown) => void }> = {
			VKWebAppClose: { postMessage: data => forwarded.push(data) },
		};
		bridgeWindow().webkit = { messageHandlers: handlers };

		expect(installNativeCapture(call => calls.push(call))).toBe(true);

		// vk-bridge's iOS detection stays intact through the proxy…
		const webkit = bridgeWindow().webkit;
		expect(typeof webkit?.messageHandlers?.["VKWebAppClose"]).toBe("object");
		// …and a reference captured before the install sees the wrap too
		// (the collection entry was replaced with the proxy in place).
		// The handler's postMessage is NOT window.postMessage. The rule
		// is a false positive here.
		// oxlint-disable-next-line unicorn/require-post-message-target-origin
		handlers["VKWebAppClose"].postMessage({ request_id: "1_a" });

		expect(forwarded).toEqual([{ request_id: "1_a" }]);
		expect(calls).toEqual([{ name: "VKWebAppClose", params: { request_id: "1_a" } }]);
	});

	it("reports nothing without native bridges", () => {
		const calls: unknown[] = [];
		expect(installNativeCapture(call => calls.push(call))).toBe(false);
		expect(calls).toEqual([]);
	});

	it("non-JSON Android payloads are skipped", () => {
		const calls: string[] = [];
		bridgeWindow().AndroidBridge = {
			something: (serialized: string) => serialized,
		};
		installNativeCapture(() => calls.push("x"));

		android()["something"]?.("not json");
		expect(calls).toEqual([]);
	});
});
