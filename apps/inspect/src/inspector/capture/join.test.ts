import { describe, expect, it } from "vitest";
import { RequestJoiner } from "./join.ts";

describe("RequestJoiner", () => {
	it("pairs a request_id with its send id once", () => {
		const joiner = new RequestJoiner();
		joiner.record("1_a", 7);
		expect(joiner.take("1_a")).toBe(7);
		expect(joiner.take("1_a")).toBeUndefined(); // one-shot
	});

	it("keeps unknown request ids unknown", () => {
		const joiner = new RequestJoiner();
		expect(joiner.take("nope")).toBeUndefined();
	});

	it("bounds the map: oldest pending pairings drop first", () => {
		const joiner = new RequestJoiner();
		for (let i = 0; i < 1_000; i++) {
			joiner.record(`r${i}`, i);
		}
		// the flood evicts the oldest, including one that would answer
		joiner.record("flood", 9999);
		expect(joiner.take("r0")).toBeUndefined();
		// recent entries (and the newcomer) still pair
		expect(joiner.take("flood")).toBe(9999);
		expect(joiner.take("r999")).toBe(999);
	});
});
