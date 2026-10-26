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
});
