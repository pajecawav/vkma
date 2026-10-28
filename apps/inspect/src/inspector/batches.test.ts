import type { TapEvent } from "@vkma.dev/protocol/schemas";
import { describe, expect, it } from "vitest";
import { eventBatches } from "./batches.ts";

const row = (id: number): TapEvent => ({
	id,
	ts: id,
	direction: "out",
	kind: "send",
	name: "VKWebAppInit",
});

describe("eventBatches (the wire's .max(200) is absolute)", () => {
	it("an empty queue produces nothing", () => {
		expect(eventBatches([], "c1")).toEqual([]);
	});

	it("a small queue ships as one batch", () => {
		const batches = eventBatches([row(1), row(2)], "c1");
		expect(batches).toHaveLength(1);
		expect(batches[0]?.events).toHaveLength(2);
		expect(batches[0]?.clientId).toBe("c1");
	});

	it("exactly 200 is one batch (the boundary itself is legal)", () => {
		const batches = eventBatches(
			Array.from({ length: 200 }, (_, i) => row(i)),
			"c1",
		);
		expect(batches).toHaveLength(1);
	});

	it("201 splits 200 + 1 — nothing is dropped", () => {
		const batches = eventBatches(
			Array.from({ length: 201 }, (_, i) => row(i)),
			"c1",
		);
		expect(batches).toHaveLength(2);
		expect(batches[0]?.events).toHaveLength(200);
		expect(batches[1]?.events).toHaveLength(1);
		expect(batches[1]?.events[0]?.id).toBe(200);
	});

	it("450 keeps every row in order across three batches", () => {
		const rows = Array.from({ length: 450 }, (_, i) => row(i));
		const batches = eventBatches(rows, "c1");
		expect(batches.map(batch => batch.events.length)).toEqual([200, 200, 50]);
		const ids = batches.flatMap(batch => batch.events.map(event => event.id));
		expect(ids).toEqual(rows.map(event => event.id));
	});
});
