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
	it("bounds the resolving buffer: hostile spam drops oldest", () => {
		setAndroidBridge({ VKWebAppPing: () => "native" });
		const rows: TapEvent[] = [];
		const capture = new InspectorCapture();

		// 1_050 raw calls while resolving — the buffer caps at 1_000
		for (let i = 0; i < 1_050; i++) {
			callAndroid("VKWebAppPing", { request_id: `spam_${i}` });
		}

		capture.finalize(undefined, event => rows.push(event));
		expect(rows).toHaveLength(1_000);
		const ids = rows.map(row => (row.payload as { request_id: string }).request_id);
		expect(ids[0]).toBe("spam_50"); // the oldest 50 dropped
		expect(ids.at(-1)).toBe("spam_1049");
	});

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

	it("direct mode: the tap adds out-rows, raw layers stay live, the buffer merges", () => {
		const tap = fakeTap();
		const handle: BridgeHandle = {
			tap: tap,
			send: async name => `direct:${name}`,
		};

		setAndroidBridge({ VKWebAppRun: () => "native" });
		const rows: TapEvent[] = [];
		const capture = new InspectorCapture();
		callAndroid("VKWebAppRun", { request_id: "r1" }); // buffered while resolving
		capture.finalize(handle, event => {
			rows.push(event);
		});

		// the spy-era row was NOT discarded — the tap's (empty) replay
		// does not cover it, so it merges in
		expect(rows).toHaveLength(1);
		expect(rows[0]).toMatchObject({ kind: "send", name: "VKWebAppRun" });

		// the tap contributes outgoing rows (one row-id space for all
		// sources — reqId pairing depends on it)
		tap.emit({ id: 9001, ts: 1, direction: "out", kind: "send", name: "VKWebAppInit" });
		tap.emit({ id: 9002, ts: 2, direction: "out", kind: "send", name: "vk-connect" }); // chatter
		tap.emit({ id: 9003, ts: 3, direction: "in", kind: "event", name: "TapOnlyEvent" }); // raw owns incoming
		expect(rows).toHaveLength(2);
		expect(rows[1]).toMatchObject({ name: "VKWebAppInit" });
		expect(rows[1].id).not.toBe(9001);

		// a raw send the tap already reported (same wire request_id) does not double
		tap.emit({
			id: 9004,
			ts: 4,
			direction: "out",
			kind: "send",
			name: "VKWebAppPay",
			payload: { request_id: "r2" },
		});
		callAndroid("VKWebAppRun", { request_id: "r2" });
		expect(rows).toHaveLength(3);

		// the raw layers are NOT muted in direct mode — a page-planted
		// handle must not be able to blind the independent capture
		callAndroid("VKWebAppRun", { request_id: "r3" });
		incoming("VKWebAppUpdateConfig", { appearance: "light" });
		expect(rows).toHaveLength(5);
		expect(rows[3]).toMatchObject({ name: "VKWebAppRun", payload: { request_id: "r3" } });
		expect(rows[4]).toMatchObject({ kind: "event", name: "VKWebAppUpdateConfig" });

		// pairing works across the sources: the raw response joins the tap's send
		incoming("VKWebAppPayResult", { request_id: "r2", ok: 1 });
		expect(rows.at(-1)).toMatchObject({ kind: "response", reqId: rows[2].id, ok: true });
	});

	it("the private bridge's prefix license is issuer-scoped: spoofed prefixes are reported", () => {
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
		// a raw native call SPOOFING the public reserved prefix: the page
		// never issued that id, so the call is reported like any other
		callAndroid("VKWebAppGetAuthToken", { request_id: "__vkma_inspect_2" });
		// the license is one-shot: the first raw replay of the ISSUED id is
		// skipped (the tap row already covers it), the second is reported
		callAndroid("VKWebAppGetAuthToken", { request_id: "__vkma_inspect_1" });
		callAndroid("VKWebAppGetAuthToken", { request_id: "__vkma_inspect_1" });

		expect(rows).toHaveLength(4);
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
		expect(rows[2]).toMatchObject({
			direction: "out",
			kind: "send",
			payload: { request_id: "__vkma_inspect_2" },
		});
		expect(rows[3]).toMatchObject({
			direction: "out",
			kind: "send",
			payload: { request_id: "__vkma_inspect_1" },
		});
	});

	it("execute rides the private bridge even in direct mode (unforgeable route)", async () => {
		const capture = new InspectorCapture();
		const spyBridge: SpyBridge = {
			tap: fakeTap(),
			send: async name => `private:${name}`,
		};
		capture.hookSpyBridge(spyBridge);
		await expect(capture.execute("A")).resolves.toBe("private:A");

		const handle: BridgeHandle = {
			tap: fakeTap(),
			send: async name => `page-handle:${name}`,
		};
		capture.finalize(handle, () => {});
		await expect(capture.execute("B")).resolves.toBe("private:B");
	});
});
