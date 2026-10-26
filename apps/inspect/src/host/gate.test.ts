import { describe, expect, it } from "vitest";
import { Gate } from "./gate.ts";

describe("the approve gate", () => {
	it("defaults to ON", () => {
		expect(new Gate().isEnabled()).toBe(true);
	});

	it("persists the toggle", () => {
		const gate = new Gate();
		gate.setEnabled(false);
		expect(new Gate().isEnabled()).toBe(false);
		gate.setEnabled(true);
		expect(new Gate().isEnabled()).toBe(true);
	});

	it("remembers approved clients (bounded)", () => {
		const gate = new Gate();
		gate.approve("c1", true);
		expect(new Gate().isApproved("c1")).toBe(true);
		for (let i = 0; i < 40; i++) {
			gate.approve(`bulk-${i}`, true);
		}
		const fresh = new Gate();
		expect(fresh.isApproved("bulk-39")).toBe(true);
		expect(fresh.isApproved("c1")).toBe(false); // pushed out of the cap
	});

	it("allow-once does not persist", () => {
		const gate = new Gate();
		gate.approve("c1", false);
		expect(gate.isApproved("c1")).toBe(false);
		expect(new Gate().isApproved("c1")).toBe(false);
	});

	it("denials live for the panel load only", () => {
		const gate = new Gate();
		gate.deny("c1");
		expect(gate.isDenied("c1")).toBe(true);
		expect(new Gate().isDenied("c1")).toBe(false);
	});
});
