import { describe, expect, test } from "vitest";
import { FAB_CLOSE_MESSAGE, isFabClose } from "./fab-close.ts";

describe("isFabClose", () => {
	// Window stand-ins: identity is all the predicate compares.
	const pane = {};
	const frame = { contentWindow: pane };

	test("accepts the close message from the panel's own window", () => {
		expect(isFabClose({ data: FAB_CLOSE_MESSAGE, source: pane }, frame)).toBe(true);
	});

	test("ignores the same message from any other window", () => {
		// the page itself, a sibling frame, an ad
		for (const source of [{}, {}, null]) {
			expect(isFabClose({ data: FAB_CLOSE_MESSAGE, source }, frame)).toBe(false);
		}
	});

	test("ignores anything else our window may send", () => {
		for (const data of [
			{ type: FAB_CLOSE_MESSAGE },
			`${FAB_CLOSE_MESSAGE} `,
			"",
			null,
			undefined,
		]) {
			expect(isFabClose({ data, source: pane }, frame)).toBe(false);
		}
	});

	test("ignores a frame whose document did not load yet", () => {
		expect(isFabClose({ data: FAB_CLOSE_MESSAGE, source: pane }, { contentWindow: null })).toBe(
			false,
		);
		expect(isFabClose({ data: FAB_CLOSE_MESSAGE, source: null }, { contentWindow: null })).toBe(
			false,
		);
	});
});
