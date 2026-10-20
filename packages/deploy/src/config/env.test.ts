import { describe, expect, it } from "vitest";
import { normalizeEnvironment, readEnv } from "./env.ts";

describe("normalizeEnvironment", () => {
	it.each(["dev", "development", "DEV", "Development"])("normalizes %s to dev", value => {
		expect(normalizeEnvironment(value)).toBe("dev");
	});
	it.each(["prod", "production", "PROD"])("normalizes %s to production", value => {
		expect(normalizeEnvironment(value)).toBe("production");
	});
	it("normalizes both", () => {
		expect(normalizeEnvironment("both")).toBe("both");
		expect(normalizeEnvironment("all")).toBe("both");
	});
	it("rejects unknown values", () => {
		expect(() => normalizeEnvironment("staging")).toThrow(/Invalid environment/);
	});
});

describe("readEnv", () => {
	it("returns empty overrides for a clean env", () => {
		const result = readEnv({});
		expect(result.overrides).toEqual({});
		expect(result.ciUrls).toBe(false);
	});

	it("reads VKMA_* first", () => {
		const result = readEnv({
			VKMA_ACCESS_TOKEN: "vkma-token",
			MINI_APPS_ACCESS_TOKEN: "legacy-token",
			VKMA_APP_ID: "1",
			MINI_APPS_APP_ID: "2",
		});
		expect(result.overrides.accessToken).toBe("vkma-token");
		expect(result.overrides.appId).toBe(1);
	});

	it("falls back to MINI_APPS_* aliases", () => {
		const result = readEnv({
			MINI_APPS_ACCESS_TOKEN: "legacy-token",
			MINI_APPS_APP_ID: "7",
			MINI_APPS_ENVIRONMENT: "production",
		});
		expect(result.overrides.accessToken).toBe("legacy-token");
		expect(result.overrides.appId).toBe(7);
		expect(result.overrides.environment).toBe("production");
	});

	it("detects CI_URLS", () => {
		expect(readEnv({ CI_URLS: "1" }).ciUrls).toBe(true);
		expect(readEnv({ CI_URLS: "" }).ciUrls).toBe(false);
	});

	it("throws a validation error for a bad app id, naming the exact variable", () => {
		expect(() => readEnv({ MINI_APPS_APP_ID: "12.5" })).toThrow(/MINI_APPS_APP_ID/);
		expect(() => readEnv({ VKMA_APP_ID: "abc" })).toThrow(/VKMA_APP_ID/);
	});

	it("throws for a bad environment", () => {
		expect(() => readEnv({ MINI_APPS_ENVIRONMENT: "qa" })).toThrow(/environment/);
	});

	it("throws for a bad timeout", () => {
		expect(() => readEnv({ VKMA_TIMEOUT: "0" })).toThrow(/VKMA_TIMEOUT/);
		expect(() => readEnv({ VKMA_TIMEOUT: "-5" })).toThrow(/positive integer/);
		// parseInt without a round-trip check used to truncate these to 1
		// (or 600) — a user asking for 1000 seconds got a 1-second deadline.
		expect(() => readEnv({ VKMA_TIMEOUT: "1e3" })).toThrow(/VKMA_TIMEOUT/);
		expect(() => readEnv({ VKMA_TIMEOUT: "600s" })).toThrow(/VKMA_TIMEOUT/);
		expect(() => readEnv({ VKMA_TIMEOUT: "10min" })).toThrow(/VKMA_TIMEOUT/);
		expect(() => readEnv({ VKMA_TIMEOUT: " 30 " })).not.toThrow();
	});
});
