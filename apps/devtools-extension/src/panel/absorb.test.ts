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
		// and the next batches keep accumulating into the new run
		const next = absorbEvents(state, [event("new", 2)]);
		expect(next.map(event => event.seq)).toEqual([1, 2]);
	});

	it("keeps the previous state when a batch is empty", () => {
		const state = absorbEvents([event("r", 1)], []);
		expect(state).toHaveLength(1);
	});

	it("treats a runId-less collecting side as one legacy epoch, not a drop", () => {
		// a dev server still holding the pre-epoch plugin in memory
		const state = absorbEvents(
			[event(undefined, 1), event(undefined, 2)],
			[event(undefined, 2), event(undefined, 3)],
		);
		expect(state.map(item => item.seq)).toEqual([1, 2, 3]);
		// its events never mix with a real run's
		const upgraded = absorbEvents(state, [event("r", 1)]);
		expect(upgraded.map(item => item.runId)).toEqual(["r"]);
	});
});
