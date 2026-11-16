import { describe, expect, it } from "vitest";
import { isTunnelError } from "../errors.ts";
import { assertValidProfile, defaultProfile, sanitizeProfile } from "./profile.ts";

describe("defaultProfile", () => {
	it("uses the project directory basename", () => {
		expect(defaultProfile("/home/user/code/my-mini-app")).toBe("my-mini-app");
	});

	it("sanitizes hostile directory names", () => {
		expect(defaultProfile("/home/user/code/my app!")).toBe("my-app-");
	});

	it("falls back to default at the filesystem root", () => {
		expect(defaultProfile("/")).toBe("default");
	});

	it("truncates very long names to the profile limit", () => {
		const long = "a".repeat(200);
		expect(defaultProfile(`/x/${long}`).length).toBeLessThanOrEqual(64);
	});
});

describe("sanitizeProfile", () => {
	it("keeps filename-safe characters", () => {
		expect(sanitizeProfile("App_2026.v2-beta")).toBe("App_2026.v2-beta");
	});

	it("collapses unsafe runs into one hyphen", () => {
		expect(sanitizeProfile("my app!")).toBe("my-app-");
	});

	it("returns an empty string when nothing is usable", () => {
		expect(sanitizeProfile("моё приложение")).toBe("");
	});
});

describe("assertValidProfile", () => {
	it("accepts a tame profile", () => {
		expect(() => assertValidProfile("my-app")).not.toThrow();
	});

	it("rejects path separators and empty strings", () => {
		for (const bad of ["", "../evil", "a b", ".hidden"]) {
			try {
				assertValidProfile(bad);
				expect.unreachable(`expected ${bad} to be rejected`);
			} catch (error) {
				expect(isTunnelError(error)).toBe(true);
			}
		}
	});
});
