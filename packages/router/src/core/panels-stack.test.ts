import { describe, expect, it } from "vitest";
import { applyLocation, initialPanelsStack, panelsHistoryOf } from "./panels-stack.ts";

describe("applyLocation", () => {
	it("anchors init at the real history index (survives reload)", () => {
		const next = applyLocation(initialPanelsStack(), 3, "item");
		expect(next).toEqual({
			entries: [null, null, null, "item"],
			cursor: 3,
		});
		expect(panelsHistoryOf(next)).toEqual(["item"]);
	});

	it("treats a stateless entry (manual hash edit) as a push", () => {
		let stack = applyLocation(initialPanelsStack(), 0, "home");
		stack = applyLocation(stack, 1, "list");
		stack = applyLocation(stack, null, "about"); // manual edit at index 2
		expect(stack.cursor).toBe(2);
		expect(panelsHistoryOf(stack)).toEqual(["home", "list", "about"]);
	});

	it("pushes and truncates the forward branch", () => {
		let stack = applyLocation(initialPanelsStack(), 0, "home");
		stack = applyLocation(stack, 1, "list");
		stack = applyLocation(stack, 2, "item");
		stack = applyLocation(stack, 1, "list"); // back
		stack = applyLocation(stack, 2, "feed"); // forward push over item
		expect(panelsHistoryOf(stack)).toEqual(["home", "list", "feed"]);
	});

	it("replaces on the same index", () => {
		let stack = applyLocation(initialPanelsStack(), 0, "home");
		stack = applyLocation(stack, 0, "about");
		expect(panelsHistoryOf(stack)).toEqual(["about"]);
	});

	it("pops into unknown earlier slots by filling them with the panel", () => {
		let stack = applyLocation(initialPanelsStack(), 5, "item");
		stack = applyLocation(stack, 4, "item"); // back into unknown slot 4
		expect(stack.entries[4]).toBe("item");
		expect(stack.cursor).toBe(4);
		// slot 5 is beyond the cursor (forward branch) and does not show
		expect(panelsHistoryOf(stack)).toEqual(["item"]);
	});
});
