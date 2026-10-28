import { describe, expect, it } from "vitest";
import { CLIENT_PALETTE, clientColorIndex, RELAY_CHANNEL } from "./index.ts";
import {
	clientInfoSchema,
	looksLikeVkConnect,
	relayEventMessageSchema,
	relayHelloMessageSchema,
	tapEventSchema,
	vkConnectEnvelopeSchema,
} from "./schemas.ts";

describe("client palette", () => {
	it("is deterministic and in range", () => {
		for (const id of ["c-1", "x-abc", "0192837465", "dup", "dup"]) {
			expect(clientColorIndex(id)).toBe(clientColorIndex(id));
			expect(clientColorIndex(id)).toBeLessThan(CLIENT_PALETTE.length);
			expect(clientColorIndex(id)).toBeGreaterThanOrEqual(0);
		}
	});
});

describe("vkConnectEnvelopeSchema", () => {
	it("parses a real web-transport envelope", () => {
		const parsed = vkConnectEnvelopeSchema.safeParse({
			type: "vk-connect",
			handler: "VKWebAppGetUserInfo",
			params: { request_id: "1_2" },
			webFrameId: "frame-3",
			connectVersion: "3.0.2",
		});
		expect(parsed.success).toBe(true);
	});

	it("rejects non-vk-connect shapes", () => {
		expect(
			vkConnectEnvelopeSchema.safeParse({ type: "other", handler: "x", params: {} }).success,
		).toBe(false);
		expect(vkConnectEnvelopeSchema.safeParse({ type: "vk-connect", params: {} }).success).toBe(
			false,
		);
	});

	it("pre-filters by shape", () => {
		expect(looksLikeVkConnect({ type: "vk-connect" })).toBe(true);
		expect(looksLikeVkConnect({ type: "VKWebAppInit" })).toBe(false);
		expect(looksLikeVkConnect(null)).toBe(false);
	});
});

describe("relay message schemas", () => {
	it("parses hello and event payloads on the reserved channel", () => {
		expect(
			relayHelloMessageSchema.safeParse({
				channel: RELAY_CHANNEL,
				kind: "hello",
				found: true,
			}).success,
		).toBe(true);
		const event = tapEventSchema.parse({
			id: 1,
			ts: Date.now(),
			direction: "out",
			kind: "send",
			name: "VKWebAppInit",
		});
		expect(
			relayEventMessageSchema.safeParse({ channel: RELAY_CHANNEL, kind: "event", event })
				.success,
		).toBe(true);
	});

	it("rejects foreign channels", () => {
		expect(
			relayHelloMessageSchema.safeParse({ channel: "other", kind: "hello", found: true })
				.success,
		).toBe(false);
	});
});

describe("tapEventSchema bounds", () => {
	it("rejects out-of-range timestamps (they must never reach a Date sink)", () => {
		const base = {
			id: 1,
			ts: 1_000,
			direction: "out" as const,
			kind: "send" as const,
			name: "n",
		};
		expect(tapEventSchema.safeParse({ ...base, ts: 1e16 }).success).toBe(false);
		expect(tapEventSchema.safeParse({ ...base, ts: -1 }).success).toBe(false);
		expect(tapEventSchema.safeParse({ ...base, ts: 1.5 }).success).toBe(false); // non-integer
		expect(tapEventSchema.safeParse({ ...base, ts: Date.now() }).success).toBe(true);
	});

	it("rejects oversized names", () => {
		expect(
			tapEventSchema.safeParse({
				id: 1,
				ts: 1,
				direction: "out",
				kind: "send",
				name: "x".repeat(513),
			}).success,
		).toBe(false);
	});
});

describe("clientInfoSchema bounds", () => {
	const info = {
		clientId: "c1",
		sessionId: "s1",
		connectedAt: 1,
		lastSeenAt: 1,
		ua: "ua",
		url: "https://app.example.com/",
		platform: "web",
		bridge: false,
	};

	it("accepts a normal hello payload", () => {
		expect(clientInfoSchema.safeParse(info).success).toBe(true);
	});

	it("rejects oversized strings (parked memory is operator-owned)", () => {
		expect(clientInfoSchema.safeParse({ ...info, url: "u".repeat(8193) }).success).toBe(false);
		expect(clientInfoSchema.safeParse({ ...info, ua: "x".repeat(513) }).success).toBe(false);
		expect(clientInfoSchema.safeParse({ ...info, clientId: "c".repeat(257) }).success).toBe(
			false,
		);
	});

	it("bounds the launch-params record in count and value size", () => {
		const many: Record<string, string> = {};
		for (let i = 0; i < 129; i++) {
			many[`vk_${i}`] = "v";
		}
		expect(clientInfoSchema.safeParse({ ...info, launchParams: many }).success).toBe(false);
		expect(
			clientInfoSchema.safeParse({
				...info,
				launchParams: { vk_long: "v".repeat(2049) },
			}).success,
		).toBe(false);
		expect(
			clientInfoSchema.safeParse({ ...info, launchParams: { sign: "ok".repeat(100) } })
				.success,
		).toBe(true);
	});
});
