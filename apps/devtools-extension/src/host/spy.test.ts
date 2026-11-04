import type { TapEvent, VkConnectEnvelope } from "@vkma.dev/protocol/schemas";
import { describe, expect, it } from "vitest";
import { SpyTracker } from "./spy.ts";

const envelope = (handler: string, params: Record<string, unknown> = {}): VkConnectEnvelope => ({
	type: "vk-connect",
	handler,
	params,
});

const tapEvent = (id: number, payload: unknown, name = "VKWebAppGetUserInfoResult"): TapEvent => ({
	id,
	ts: Date.now(),
	direction: "in",
	kind: "event",
	name,
	payload,
});

describe("SpyTracker id spaces", () => {
	it("synthesizes send ids from the negative space — tap ids (from 1) never collide", () => {
		const tracker = new SpyTracker();
		const ids = new Set<number>();
		for (let index = 0; index < 50; index++) {
			const send = tracker.synthesizeSend("c", envelope(`M${index}`));
			expect(send.id).toBeLessThan(0);
			ids.add(send.id);
		}
		expect(ids.size).toBe(50);
	});

	it("id spaces are per client — cross-client collisions are fine, keys carry the clientId", () => {
		const tracker = new SpyTracker();
		const a = tracker.synthesizeSend("a", envelope("M"));
		const b = tracker.synthesizeSend("b", envelope("M"));
		// row keys are `${clientId}:${id}`, so the same bare id under
		// different clients is not a collision
		expect(`${a.id}`).toBe(`${b.id}`);
		const a2 = tracker.synthesizeSend("a", envelope("M"));
		expect(a2.id).not.toBe(a.id);
	});
});

describe("SpyTracker pairing", () => {
	it("reclassifies the response carrying a sniffed request_id and pairs it to the send", () => {
		const tracker = new SpyTracker();
		const send = tracker.synthesizeSend(
			"c",
			envelope("VKWebAppGetUserInfo", { request_id: "1_2" }),
		);
		// a tap event whose own id collides with nothing, but note the
		// classic collision: tap ids count from 1, the send's id is negative
		expect(send.id).toBe(-1);

		const reclassified = tracker.reclassify("c", tapEvent(1, { request_id: "1_2", data: 7 }));
		expect(reclassified.kind).toBe("response");
		expect(reclassified.reqId).toBe(send.id);
		expect(reclassified.ok).toBe(true);
		expect(reclassified.payload).toEqual({ data: 7 }); // request_id stripped
	});

	it("marks error responses", () => {
		const tracker = new SpyTracker();
		tracker.synthesizeSend("c", envelope("M", { request_id: "5" }));
		const reclassified = tracker.reclassify(
			"c",
			tapEvent(2, { request_id: "5", error_type: "client_error" }),
		);
		expect(reclassified.kind).toBe("response");
		expect(reclassified.ok).toBe(false);
	});

	it("passes unpaired payloads through untouched (foreign or stale request ids)", () => {
		const tracker = new SpyTracker();
		const event = tapEvent(3, { request_id: "999", data: 1 });
		expect(tracker.reclassify("c", event)).toEqual(event);
		const noId = tapEvent(4, { data: 2 });
		expect(tracker.reclassify("c", noId)).toEqual(noId);
	});

	it("pairs to the RIGHT send when several requests share a name", () => {
		const tracker = new SpyTracker();
		const first = tracker.synthesizeSend("c", envelope("M", { request_id: "r1" }));
		const second = tracker.synthesizeSend("c", envelope("M", { request_id: "r2" }));
		const lateFirst = tracker.reclassify("c", tapEvent(10, { request_id: "r1" }, "MResult"));
		expect(lateFirst.kind).toBe("response");
		if (lateFirst.kind === "response") {
			expect(lateFirst.reqId).toBe(first.id);
			expect(lateFirst.reqId).not.toBe(second.id);
		}
	});

	it("reset drops the pairing state (a client's page reloaded)", () => {
		const tracker = new SpyTracker();
		tracker.synthesizeSend("c", envelope("M", { request_id: "r1" }));
		tracker.reset("c");
		const after = tracker.reclassify("c", tapEvent(5, { request_id: "r1" }));
		expect(after.kind).toBe("event"); // no stale pairing across sessions
	});
});
