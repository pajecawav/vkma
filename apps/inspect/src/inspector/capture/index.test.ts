import type { TapEvent } from "@vkma.dev/protocol/schemas";
import { afterEach, describe, expect, it } from "vitest";
import { InspectorCapture, type BridgeHandle, type SpyBridge } from "./index.ts";

/**
 * The capture pipeline end to end: buffer → finalize (direct/spy),
 * request_id joining across the raw layers, and the reserved-prefix
 * skip for the private execute bridge. Native hooks install in the
 * constructor — the fake AndroidBridge goes up FIRST.
 */

afterEach(() => {
	delete (window as unknown as { AndroidBridge?: unknown }).AndroidBridge;
});

function setAndroidBridge(methods: Record<string, (serialized: string) => unknown>): void {
	(window as unknown as { AndroidBridge?: unknown }).AndroidBridge = methods;
}

function callAndroid(name: string, params: Record<string, unknown>): void {
	const bridge = (window as unknown as { AndroidBridge: Record<string, (s: string) => unknown> })
		.AndroidBridge;
	bridge[name](JSON.stringify(params));
}

function incoming(type: string, data: Record<string, unknown>): void {
	window.dispatchEvent(new CustomEvent("VKWebAppEvent", { detail: { type, data } }));
}

interface FakeTap {
	emit(event: Omit<TapEvent, never>): void;
}

function fakeTap(): FakeTap & {
	subscribe: (listener: (event: TapEvent) => void) => () => void;
	listeners: Set<(event: TapEvent) => void>;
} {
	const listeners = new Set<(event: TapEvent) => void>();
	return {
		listeners,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		emit(event) {
			for (const listener of listeners) {
				listener(event);
			}
		},
	};
}

describe("InspectorCapture", () => {
	it("buffers while resolving, flushes once spy is final, joins responses", () => {
		const androidCalls: string[] = [];
		setAndroidBridge({
			VKWebAppGetUserInfo: serialized => {
				androidCalls.push(serialized); // forwarded first, always
				return "native";
			},
		});

		const rows: TapEvent[] = [];
		const capture = new InspectorCapture(); // hooks go in now

		// captured while still resolving → held in the buffer
		callAndroid("VKWebAppGetUserInfo", { request_id: "1_a", user_id: 1 });
		expect(rows).toHaveLength(0);

		capture.finalize(undefined, event => {
			rows.push(event);
		});
		expect(rows).toHaveLength(1); // the buffered row flushed
		expect(rows[0]).toMatchObject({
			kind: "send",
			name: "VKWebAppGetUserInfo",
			direction: "out",
		});
		expect(androidCalls).toHaveLength(1); // the native handler ran

		incoming("VKWebAppGetUserInfoResult", { request_id: "1_a", response: [] });
		incoming("VKWebAppUpdateConfig", { appearance: "light" });
		incoming("VKWebAppSettings", { frameId: "f1" }); // transport chatter — never a row

		expect(rows).toHaveLength(3);
		expect(rows[1]).toMatchObject({
			kind: "response",
			name: "VKWebAppGetUserInfoResult",
			reqId: rows[0].id,
			ok: true,
		});
		expect(rows[2]).toMatchObject({ kind: "event", name: "VKWebAppUpdateConfig" });
	});

	it("an error_type response is ok:false with the request_id stripped", () => {
		setAndroidBridge({ VKWebAppCall: () => {} });
		const rows: TapEvent[] = [];
		const capture = new InspectorCapture();
		capture.finalize(undefined, event => {
			rows.push(event);
		});

		callAndroid("VKWebAppCall", { request_id: "7_b" });
		incoming("VKWebAppCallFailed", { request_id: "7_b", error_type: "some" });

		expect(rows[1]).toMatchObject({ kind: "response", ok: false });
		expect(rows[1].payload).toEqual({ error_type: "some" }); // request_id stripped
	});

	it("direct mode: the tap is authoritative, the buffer is discarded, raw layers muted", () => {
		const tap = fakeTap();
		const handle: BridgeHandle = {
			tap: tap,
			send: async name => `direct:${name}`,
		};

		setAndroidBridge({ VKWebAppRun: () => "native" });
		const rows: TapEvent[] = [];
		const capture = new InspectorCapture();
		callAndroid("VKWebAppRun", {}); // buffered — but the flip discards it
		capture.finalize(handle, event => {
			rows.push(event);
		});
		expect(rows).toHaveLength(0);

		tap.emit({ id: 1, ts: 1, direction: "out", kind: "send", name: "VKWebAppInit" });
		tap.emit({ id: 2, ts: 2, direction: "out", kind: "send", name: "vk-connect" }); // chatter
		callAndroid("VKWebAppRun", {}); // muted in direct mode
		incoming("VKWebAppUpdateConfig", {}); // muted in direct mode

		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ name: "VKWebAppInit" });
	});

	it("the private execute bridge contributes out-rows; raw layers skip its prefix", () => {
		setAndroidBridge({ VKWebAppGetAuthToken: () => {} });
		const rows: TapEvent[] = [];
		const capture = new InspectorCapture();
		capture.finalize(undefined, event => {
			rows.push(event);
		});

		const tap = fakeTap();
		capture.hookSpyBridge({
			tap: tap,
			send: async () => "ok",
		});

		// our own execute send — reported through the private bridge's tap
		tap.emit({
			id: 1,
			ts: 1,
			direction: "out",
			kind: "send",
			name: "VKWebAppGetAuthToken",
			payload: { request_id: "__vkma_inspect_1" },
		});
		// its response pairs through the raw listener
		incoming("VKWebAppAccessTokenReceived", {
			request_id: "__vkma_inspect_1",
			access_token: "t",
		});
		// a raw native call with the reserved prefix is NOT reported again
		callAndroid("VKWebAppGetAuthToken", { request_id: "__vkma_inspect_2" });

		expect(rows).toHaveLength(2);
		expect(rows[0]).toMatchObject({
			direction: "out",
			kind: "send",
			name: "VKWebAppGetAuthToken",
			payload: { request_id: "__vkma_inspect_1" },
		});
		expect(rows[1]).toMatchObject({
			direction: "in",
			kind: "response",
			name: "VKWebAppAccessTokenReceived",
			ok: true,
			reqId: rows[0].id,
		});
	});

	it("execute prefers the direct handle, falls back to the spy bridge", async () => {
		const capture = new InspectorCapture();
		const spyBridge: SpyBridge = {
			tap: fakeTap(),
			send: async name => `spy:${name}`,
		};
		capture.hookSpyBridge(spyBridge);
		await expect(capture.execute("A")).resolves.toBe("spy:A");

		const handle: BridgeHandle = {
			tap: fakeTap(),
			send: async name => `direct:${name}`,
		};
		capture.finalize(handle, () => {});
		await expect(capture.execute("B")).resolves.toBe("direct:B");
	});
});
