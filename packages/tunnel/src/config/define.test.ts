import { describe, expect, it } from "vitest";
import { defineTunnelConfig } from "./define.ts";

describe("defineTunnelConfig", () => {
	it("is an identity function providing types only", () => {
		const input = { port: 5173, route: "app" as const };
		expect(defineTunnelConfig(input)).toBe(input);
	});
});
