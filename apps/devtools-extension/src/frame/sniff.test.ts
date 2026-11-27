import type { VkConnectEnvelope } from "@vkma.dev/protocol/schemas";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	childEnvelopeListener,
	type MessageLike,
	type SniffedEnvelope,
	SniffUplink,
} from "./sniff.ts";

const envelope = (handler: string, params: Record<string, unknown> = {}): VkConnectEnvelope => ({
	type: "vk-connect",
	handler,
	params,
});

const APP = "https://app.example.com";

/** What a `message` listener is handed, as far as this code reads it. */
const message = (source: unknown, data: unknown, origin = APP): MessageLike => ({
	source: source as MessageEventSource | null,
	data,
	origin,
});

const sniffed = (handler: string): SniffedEnvelope => ({
	envelope: envelope(handler),
	origin: APP,
	ts: 1,
});
const handlers = (batch: SniffedEnvelope[] | undefined): string[] =>
	(batch ?? []).map(item => item.envelope.handler);

describe("childEnvelopeListener", () => {
	it("reports a vk-connect envelope a child posted in, with the sender's origin", () => {
		const report = vi.fn();
		const frame = {};
		childEnvelopeListener(
			frame,
			report,
		)(message({}, envelope("VKWebAppGetUserInfo", { user_id: 7 })));
		expect(report).toHaveBeenCalledTimes(1);
		const reported = report.mock.calls[0]?.[0] as SniffedEnvelope;
		expect(reported.envelope.handler).toBe("VKWebAppGetUserInfo");
		expect(reported.envelope.params).toEqual({ user_id: 7 });
		expect(reported.origin).toBe(APP);
		expect(reported.ts).toBeTypeOf("number");
	});

	it("ignores the frame's own posts and everything that is not vk-connect", () => {
		const report = vi.fn();
		const frame = {};
		const listener = childEnvelopeListener(frame, report);
		// a page talking to itself
		listener(message(frame, envelope("VKWebAppInit")));
		// the host answering a child: host → app traffic, not a request
		listener(message({}, { type: "VKWebAppGetUserInfoResult", data: { user_id: 7 } }));
		listener(message({}, "vk-connect"));
		listener(message({}, null));
		listener(message({}, undefined));
		expect(report).not.toHaveBeenCalled();
	});

	it("keeps a message whose sender is already gone", () => {
		// a transient frame that posted and was removed: source is null,
		// its origin still tells whose request it was
		const report = vi.fn();
		childEnvelopeListener({}, report)(message(null, envelope("VKWebAppInit")));
		expect(report).toHaveBeenCalledTimes(1);
	});
});

describe("SniffUplink", () => {
	type Deliver = (batch: SniffedEnvelope[]) => Promise<void>;
	let deliver: ReturnType<typeof vi.fn<Deliver>>;

	beforeEach(() => {
		vi.useFakeTimers();
		deliver = vi.fn<Deliver>();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	/** Lets every promise chain settled so far run out. */
	const settle = async (): Promise<void> => {
		await vi.advanceTimersByTimeAsync(0);
	};

	it("delivers in order, and what arrives during a delivery follows right after it", async () => {
		deliver.mockResolvedValue(undefined);
		const uplink = new SniffUplink(deliver, { retryMs: 100, maxFailures: 3 });
		uplink.push(sniffed("A"));
		uplink.push(sniffed("B"));
		await settle();
		expect(deliver.mock.calls.map(([batch]) => handlers(batch))).toEqual([["A"], ["B"]]);
		uplink.push(sniffed("C"));
		await settle();
		expect(deliver.mock.calls.map(([batch]) => handlers(batch))).toEqual([["A"], ["B"], ["C"]]);
	});

	it("a delivery the host could not take yet is retried, its envelopes still in order", async () => {
		const uplink = new SniffUplink(deliver, { retryMs: 1_000, maxFailures: 3 });
		deliver.mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(undefined);
		uplink.push(sniffed("A"));
		await settle();
		expect(deliver).toHaveBeenCalledTimes(1);

		// nothing more leaves during the pause, however much arrives
		uplink.push(sniffed("B"));
		await settle();
		expect(deliver).toHaveBeenCalledTimes(1);

		await vi.advanceTimersByTimeAsync(1_000);
		expect(deliver).toHaveBeenCalledTimes(2);
		expect(handlers(deliver.mock.calls[1]?.[0])).toEqual(["A", "B"]);
	});

	it("gives up on a tab that never answers: the queue is dropped and nothing more leaves", async () => {
		deliver.mockRejectedValue(new Error("timeout"));
		const uplink = new SniffUplink(deliver, { retryMs: 100, maxFailures: 2 });
		uplink.push(sniffed("A"));
		await settle();
		await vi.advanceTimersByTimeAsync(100);
		expect(deliver).toHaveBeenCalledTimes(2);

		uplink.push(sniffed("B"));
		await vi.advanceTimersByTimeAsync(10_000);
		expect(deliver).toHaveBeenCalledTimes(2);
	});

	it("one delivery that gets through starts the count of failures over", async () => {
		const uplink = new SniffUplink(deliver, { retryMs: 100, maxFailures: 3 });
		deliver.mockRejectedValue(new Error("timeout"));
		uplink.push(sniffed("A"));
		await settle(); // 1: [A] fails
		await vi.advanceTimersByTimeAsync(100); // 2: [A] fails
		expect(deliver).toHaveBeenCalledTimes(2);

		deliver.mockResolvedValue(undefined);
		uplink.push(sniffed("B"));
		await vi.advanceTimersByTimeAsync(100); // 3: [A, B] gets through
		expect(handlers(deliver.mock.calls[2]?.[0])).toEqual(["A", "B"]);

		// the next two failures are not the third in a row
		deliver.mockRejectedValue(new Error("timeout"));
		uplink.push(sniffed("C"));
		await settle(); // 4: [C] fails
		uplink.push(sniffed("D"));
		await vi.advanceTimersByTimeAsync(100); // 5: [C, D] fails
		uplink.push(sniffed("E"));
		await vi.advanceTimersByTimeAsync(100); // 6: [C, D, E]
		expect(handlers(deliver.mock.calls.at(-1)?.[0])).toEqual(["C", "D", "E"]);
		expect(deliver).toHaveBeenCalledTimes(6);
	});

	it("never holds more than a bounded backlog while the host is out of reach", async () => {
		deliver.mockRejectedValue(new Error("timeout"));
		const uplink = new SniffUplink(deliver, { retryMs: 100, maxFailures: 1_000 });
		for (let index = 0; index < 150; index++) {
			uplink.push(sniffed(`M${index}`));
		}
		// the first delivery took M0; the pause held the rest, newest kept
		await settle();
		await vi.advanceTimersByTimeAsync(100);
		const retried = handlers(deliver.mock.calls.at(-1)?.[0]);
		expect(retried).toHaveLength(100);
		expect(retried[0]).toBe("M50");
		expect(retried.at(-1)).toBe("M149");
	});

	it("dispose stops it: later finds are ignored and no retry is left behind", async () => {
		deliver.mockRejectedValue(new Error("timeout"));
		const uplink = new SniffUplink(deliver, { retryMs: 100, maxFailures: 1_000 });
		uplink.push(sniffed("A"));
		await settle();
		expect(deliver).toHaveBeenCalledTimes(1);
		uplink.dispose();
		uplink.push(sniffed("B"));
		await vi.advanceTimersByTimeAsync(10_000);
		expect(deliver).toHaveBeenCalledTimes(1);
	});
});
