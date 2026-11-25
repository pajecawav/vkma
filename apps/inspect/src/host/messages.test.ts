import { describe, expect, it } from "vitest";
import {
	helloMessageSchema,
	eventsMessageSchema,
	execResultMessageSchema,
	parseInspectorMessage,
} from "./messages.ts";

const clientInfo = {
	clientId: "c1",
	sessionId: "s1",
	connectedAt: 1,
	lastSeenAt: 1,
	ua: "test",
	url: "https://app.example.com/",
	platform: "android",
	bridge: false,
};

const tapEvent = {
	id: 1,
	ts: 1,
	direction: "out" as const,
	kind: "send" as const,
	name: "VKWebAppInit",
};

describe("inspect message boundary", () => {
	it("parses a hello", () => {
		expect(parseInspectorMessage({ v: 1, t: "hello", info: clientInfo })).toEqual({
			v: 1,
			t: "hello",
			info: clientInfo,
		});
	});

	it("parses an events batch and an exec-result", () => {
		expect(
			parseInspectorMessage({ v: 1, t: "events", clientId: "c1", events: [tapEvent] }),
		).toMatchObject({ t: "events", events: [tapEvent] });
		expect(
			parseInspectorMessage({ v: 1, t: "exec-result", execId: 1, clientId: "c1", ok: true }),
		).toMatchObject({ t: "exec-result", ok: true });
	});

	it("rejects a wrong protocol version", () => {
		expect(parseInspectorMessage({ v: 2, t: "hello", info: clientInfo })).toBeUndefined();
	});

	it("rejects unknown types and junk", () => {
		expect(parseInspectorMessage({ v: 1, t: "nope" })).toBeUndefined();
		expect(parseInspectorMessage("hello")).toBeUndefined();
		expect(parseInspectorMessage(null)).toBeUndefined();
	});

	it("rejects a hello with a malformed client info", () => {
		expect(
			parseInspectorMessage({ v: 1, t: "hello", info: { ...clientInfo, clientId: 42 } }),
		).toBeUndefined();
	});

	it("admits a hello that crossed binarypack without an app id", () => {
		// PeerJS has no `undefined` on the wire: the inspector's
		// `appId: undefined` arrives as null. That hello dropped here, so a
		// page launched without vk_app_id/api_id could never connect.
		const parsed = parseInspectorMessage({
			v: 1,
			t: "hello",
			info: { ...clientInfo, appId: null },
		});
		expect(parsed).toEqual({ v: 1, t: "hello", info: clientInfo });
		expect(
			parseInspectorMessage({ v: 1, t: "hello", info: { ...clientInfo, appId: "42" } }),
		).toEqual({ v: 1, t: "hello", info: { ...clientInfo, appId: "42" } });
	});

	it("an app id still has to be a string of a sane size, null aside", () => {
		expect(
			parseInspectorMessage({ v: 1, t: "hello", info: { ...clientInfo, appId: 42 } }),
		).toBeUndefined();
		expect(
			parseInspectorMessage({
				v: 1,
				t: "hello",
				info: { ...clientInfo, appId: "x".repeat(65) },
			}),
		).toBeUndefined();
	});

	it("rejects events with malformed tap events", () => {
		const bad = { ...tapEvent, direction: "sideways" };
		expect(
			parseInspectorMessage({ v: 1, t: "events", clientId: "c1", events: [bad] }),
		).toBeUndefined();
		expect(helloMessageSchema.safeParse({ v: 1, t: "hello", info: clientInfo }).success).toBe(
			true,
		);
		expect(
			eventsMessageSchema.safeParse({ v: 1, t: "events", clientId: "", events: [] }).success,
		).toBe(true);
		expect(
			execResultMessageSchema.safeParse({ v: 1, t: "exec-result", execId: "x" }).success,
		).toBe(false);
	});
});

describe("inspect message boundary bounds", () => {
	it("rejects an oversized events batch (cardinality cap)", () => {
		const batch = Array.from({ length: 201 }, (_, i) => ({ ...tapEvent, id: i + 1 }));
		expect(
			parseInspectorMessage({ v: 1, t: "events", clientId: "c1", events: batch }),
		).toBeUndefined();
		expect(
			parseInspectorMessage({
				v: 1,
				t: "events",
				clientId: "c1",
				events: batch.slice(0, 200),
			}),
		).toBeDefined();
	});

	it("rejects an oversized clientId and an out-of-range ts", () => {
		expect(
			parseInspectorMessage({
				v: 1,
				t: "events",
				clientId: "x".repeat(257),
				events: [tapEvent],
			}),
		).toBeUndefined();
		expect(
			parseInspectorMessage({
				v: 1,
				t: "events",
				clientId: "c1",
				events: [{ ...tapEvent, ts: 1e16 }],
			}),
		).toBeUndefined();
	});
});
