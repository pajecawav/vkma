import type { WireEvent } from "@vkma.dev/protocol";
import { describe, expect, it } from "vitest";
import { MergedTimeline } from "./merge.ts";

const event = (clientId: string, seq: number, ts: number): WireEvent => ({
	id: seq,
	ts,
	clientId,
	direction: "out",
	kind: "send",
	name: "VKWebAppInit",
	seq,
	runId: "r",
});

describe("MergedTimeline", () => {
	it("keeps same-seq events from different hosts as distinct rows", () => {
		const merger = new MergedTimeline();
		const merged = merger.merge([
			{ events: [event("a", 1, 10)] },
			{ events: [event("b", 1, 20)] },
		]);
		expect(merged).toHaveLength(2);
		expect(new Set(merged.map(e => e.seq)).size).toBe(2);
	});

	it("orders by wire timestamp, not by host seq", () => {
		const merger = new MergedTimeline();
		const merged = merger.merge([
			{ events: [event("a", 100, 500)] }, // high seq, early
			{ events: [event("b", 1, 900)] }, // low seq, late
		]);
		expect(merged.map(e => e.clientId)).toEqual(["a", "b"]);
		expect(merged.map(e => e.seq)).toEqual([1, 2]);
	});

	it("derives stable global seqs across re-merges (clear/pause anchors hold)", () => {
		const merger = new MergedTimeline();
		const feedA = { events: [event("a", 1, 10), event("a", 2, 20)] };
		const first = merger.merge([feedA]);
		const second = merger.merge([feedA, { events: [event("b", 1, 30)] }]);
		expect(second.slice(0, 2).map(e => e.seq)).toEqual(first.map(e => e.seq));
		// the late-comer gets the next number even though its host seq is 1
		expect(second.at(-1)?.seq).toBe(3);
		// the merger never mutates the feed's own events
		expect(feedA.events.map(e => e.seq)).toEqual([1, 2]);
	});

	it("evicts memoized seqs of events that left the feeds", () => {
		const merger = new MergedTimeline();
		const feedA = { events: [event("a", 1, 10)] };
		const first = merger.merge([feedA]);
		expect(first.map(e => e.seq)).toEqual([1]);
		// the feed disappears (tab closed / host reloaded) — empty merge
		expect(merger.merge([])).toEqual([]);
		// a reappearing key draws a FRESH seq; no collision with the past
		const second = merger.merge([feedA]);
		expect(second.map(e => e.seq)).toEqual([2]);
	});
});
