import { describe, expect, it } from "vitest";
import { defineDeployConfig } from "./define.ts";

describe("defineDeployConfig", () => {
	it("is an identity function providing types only", () => {
		const input = { appId: 1, staticPath: "./build", environment: "dev" as const };
		expect(defineDeployConfig(input)).toBe(input);
	});
});
