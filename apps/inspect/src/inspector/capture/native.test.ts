import { afterEach, describe, expect, it } from "vitest";
import { installNativeCapture } from "./native.ts";

/**
 * The native wraps against fakes — the happy-dom stand-ins for what the
 * VK webview injects. The contract under test: FORWARD FIRST (the page
 * must behave as if we were never there), then report; and both an
 * already-captured reference (in-place mutation) and a fresh reader
 * (the window-level Proxy) see the wrap.
 */

afterEach(() => {
	delete (window as { AndroidBridge?: unknown }).AndroidBridge;
	delete (window as { webkit?: unknown }).webkit;
});

describe("installNativeCapture", () => {
	it("forwards Android calls first, then reports them", () => {
		const forwarded: string[] = [];
		const calls: { name: string; params: Record<string, unknown> }[] = [];
		const original = {
			VKWebAppGetUserInfo: (serialized: string) => {
				forwarded.push(serialized);
				return "native-result";
			},
		};
		(window as { AndroidBridge?: unknown }).AndroidBridge = original;

		expect(installNativeCapture(call => calls.push(call))).toBe(true);
		const result = (window as { AndroidBridge: Record<string, (s: string) => unknown> })
			.AndroidBridge["VKWebAppGetUserInfo"]!(JSON.stringify({ user_id: 1 }));

		expect(result).toBe("native-result"); // forwarded to the real handler
		expect(forwarded).toEqual([JSON.stringify({ user_id: 1 })]); // untouched wire data
		expect(calls).toEqual([{ name: "VKWebAppGetUserInfo", params: { user_id: 1 } }]);
	});

	it("an already-captured reference sees the wrap (in-place mutation)", () => {
		const calls: string[] = [];
		const original = {
			VKWebAppRun: (serialized: string) => `ran:${serialized}`,
		};
		(window as { AndroidBridge?: unknown }).AndroidBridge = original;
		// the app's bridge module captured this BEFORE the inspector loaded
		const captured = (window as { AndroidBridge: Record<string, (s: string) => unknown> })
			.AndroidBridge;

		installNativeCapture(call => calls.push(call.name));
		captured["VKWebAppRun"]!(JSON.stringify({}));

		expect(calls).toEqual(["VKWebAppRun"]);
	});

	it("a handler the native side adds later gets wrapped on first read", () => {
		const calls: string[] = [];
		const original: Record<string, (serialized: string) => void> = {
			VKWebAppRun: () => {},
		};
		(window as { AndroidBridge?: unknown }).AndroidBridge = original;
		installNativeCapture(call => calls.push(call.name));

		original["VKWebAppNewThing"] = () => {}; // added after the inspector
		const proxied = (window as { AndroidBridge: Record<string, (s: string) => void> })
			.AndroidBridge;
		proxied["VKWebAppNewThing"]!(JSON.stringify({ request_id: "9" }));

		expect(calls).toEqual(["VKWebAppNewThing"]);
	});

	it("never touches constructor or dunder members", () => {
		const calls: string[] = [];
		const original: Record<string, unknown> = {
			VKWebAppRun: () => {},
			__internal: (serialized: string) => serialized,
		};
		(window as { AndroidBridge?: unknown }).AndroidBridge = original;
		installNativeCapture(call => calls.push(call.name));

		expect(() => {
			const proxied = (window as { AndroidBridge: Record<string, (s: string) => unknown> })
				.AndroidBridge;
			proxied["__internal"]?.("{}");
		}).not.toThrow();
		expect(calls).toEqual([]);
	});

	it("wraps iOS message handlers: postMessage forwards, then reports", () => {
		const forwarded: unknown[] = [];
		const calls: { name: string; params: Record<string, unknown> }[] = [];
		const handlers: Record<string, { postMessage: (data: unknown) => void }> = {
			VKWebAppClose: { postMessage: data => forwarded.push(data) },
		};
		(window as { webkit?: unknown }).webkit = { messageHandlers: handlers };

		expect(installNativeCapture(call => calls.push(call))).toBe(true);

		// vk-bridge's iOS detection stays intact through the proxy…
		const webkit = (window as { webkit: { messageHandlers: Record<string, unknown> } }).webkit;
		expect(typeof webkit.messageHandlers["VKWebAppClose"]).toBe("object");
		// …and a captured reference to the collection sees the wrap too
		const captured = handlers["VKWebAppClose"] as unknown as { postMessage(d: unknown): void };
		captured.postMessage({ request_id: "1_a" });

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
		const original = { something: (serialized: string) => serialized };
		(window as { AndroidBridge?: unknown }).AndroidBridge = original;
		installNativeCapture(() => calls.push("x"));

		const proxied = (window as { AndroidBridge: Record<string, (s: string) => unknown> })
			.AndroidBridge;
		proxied["something"]!("not json");
		expect(calls).toEqual([]);
	});
});
