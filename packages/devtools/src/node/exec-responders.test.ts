import { describe, expect, it } from "vitest";
import { ExecResponders } from "./exec-responders.ts";

describe("ExecResponders", () => {
	it("binds a client to its registering session by identity", () => {
		const responders = new ExecResponders();
		const sessionA = { id: "a" };
		const sessionB = { id: "b" };

		responders.bind(sessionA, "c1");
		expect(responders.responderOf("c1")).toBe(sessionA);
		expect(responders.responderOf("c1")).not.toBe(sessionB);
		expect(responders.responderOf("ghost")).toBeUndefined();
	});

	it("a later hello from a fresh session re-binds (the old one is dead)", () => {
		const responders = new ExecResponders();
		const sessionA = { id: "a" };
		const sessionB = { id: "b" };

		responders.bind(sessionA, "c1");
		responders.bind(sessionB, "c1");
		expect(responders.responderOf("c1")).toBe(sessionB);
	});

	it("prune drops bindings of clients that left the registry", () => {
		const responders = new ExecResponders();
		responders.bind({}, "live");
		responders.bind({}, "dead");

		responders.prune(id => id === "live");
		expect(responders.responderOf("live")).toBeDefined();
		expect(responders.responderOf("dead")).toBeUndefined();
	});
});
