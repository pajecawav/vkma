import { describe, expect, it } from "vitest";
import { SENSITIVE_PARAMS, scrubUrl } from "./sensitive.ts";

describe("sensitive params", () => {
	it("covers both eras of credential params", () => {
		expect([...SENSITIVE_PARAMS].toSorted()).toEqual([
			"access_token",
			"auth_key",
			"secret",
			"sid",
			"sign",
		]);
	});

	it("scrubs every sensitive value out of a url", () => {
		const url =
			"https://g.example.com/web/?api_id=1&viewer_id=2&secret=leaked&sid=vk1.a.sid&access_token=vk1.a.tok&auth_key=key&sign=s&is_app_user=1";
		const scrubbed = scrubUrl(url);
		expect(scrubbed).toContain("api_id=1");
		expect(scrubbed).toContain("viewer_id=2");
		expect(scrubbed).toContain("is_app_user=1");
		for (const leaked of ["leaked", "vk1.a.sid", "vk1.a.tok", "=key", "=s&"]) {
			expect(scrubbed).not.toContain(leaked);
		}
	});

	it("keeps non-credential launch params readable", () => {
		expect(scrubUrl("https://x/?api_id=1&api_settings=8198")).toBe(
			"https://x/?api_id=1&api_settings=8198",
		);
	});
});
