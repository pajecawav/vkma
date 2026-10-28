import type { WireEvent } from "@vkma.dev/protocol";
import { describe, expect, it } from "vitest";
import { absorbEvents } from "./absorb.ts";

const event = (runId: string | undefined, seq: number): WireEvent =>
	({
		id: seq,
		ts: seq,
		clientId: "c",
		direction: "out",
		kind: "send",
		name: "VKWebAppInit",
		seq,
		runId,
	}) as WireEvent;

describe("absorbEvents", () => {
	it("dedupes by seq within one run and keeps chronological order", () => {
		const state = absorbEvents([event("r", 1), event("r", 2)], [event("r", 2), event("r", 3)]);
		expect(state.map(event => event.seq)).toEqual([1, 2, 3]);
	});

	it("resets on a new run: the reloaded store's seq restart never mixes", () => {
		const state = absorbEvents([event("old", 1), event("old", 2)], [event("new", 1)]);
		expect(state.map(event => event.runId)).toEqual(["new"]);
		const next = absorbEvents(state, [event("new", 2)]);
		expect(next.map(event => event.seq)).toEqual([1, 2]);
	});

	it("keeps the previous state when a batch is empty", () => {
		const state = absorbEvents([event("r", 1)], []);
		expect(state).toHaveLength(1);
	});

	it("caps the timeline at 500 events", () => {
		const state = absorbEvents(
			[],
			Array.from({ length: 600 }, (_, i) => event("r", i + 1)),
		);
		expect(state).toHaveLength(500);
		expect(state.at(-1)?.seq).toBe(600);
	});
});

it("the byte budget trims the oldest oversized events (count stays under 500)", () => {
	const runId = "run-bytes";
	const blob = "x".repeat(512 * 1024);
	const row = (seq: number): WireEvent => ({
		id: seq,
		ts: 1_000,
		direction: "out",
		kind: "send",
		name: `n${seq}`,
		payload: { blob },
		clientId: "c1",
		seq,
		runId,
	});
	// 20 events x 0.5 MiB = 10 MiB > the 8 MiB budget: the oldest go
	const merged = absorbEvents(
		[],
		Array.from({ length: 20 }, (_, i) => row(i + 1)),
	);
	expect(merged.length).toBeLessThan(20);
	expect(merged.at(-1)?.seq).toBe(20); // the newest survives
	expect(merged[0]?.seq).toBeGreaterThan(1); // the oldest were evicted
});
