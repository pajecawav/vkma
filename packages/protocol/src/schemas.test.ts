import { describe, expect, it } from "vitest";
import { CLIENT_PALETTE, clientColorIndex, RELAY_CHANNEL } from "./index.ts";
import {
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
