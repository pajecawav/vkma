import { describe, expect, it } from "vitest";
import { LEGACY_LAUNCH_KEYS, isLaunchParamKey } from "./index.ts";

/**
 * The launch-params curation is a trust boundary: it decides the ONLY
 * page data a collector may ship, so a foreign key must never match,
 * neither OAuth/OIDC debris nor lookalikes of the legacy game set.
 */
describe("isLaunchParamKey", () => {
	it("vk_* and the classic standalone keys pass", () => {
		expect(isLaunchParamKey("vk_app_id")).toBe(true);
		expect(isLaunchParamKey("vk_platform")).toBe(true);
		expect(isLaunchParamKey("api_url")).toBe(true);
		expect(isLaunchParamKey("sign")).toBe(true);
	});

	it("the legacy game keys pass", () => {
		for (const key of LEGACY_LAUNCH_KEYS) {
			expect(isLaunchParamKey(key)).toBe(true);
		}
		expect(LEGACY_LAUNCH_KEYS.has("api_id")).toBe(true);
		expect(LEGACY_LAUNCH_KEYS.has("viewer_id")).toBe(true);
		expect(LEGACY_LAUNCH_KEYS.has("secret")).toBe(true);
		expect(LEGACY_LAUNCH_KEYS.has("sign_keys")).toBe(true);
	});

	it("foreign params never pass", () => {
		for (const key of [
			"code",
			"email",
			"utm_source",
			"apikey",
			"api_result",
			"api_key",
			"access_token_settings_extra",
			"vkapps", // vk_ prefix requires the underscore
		]) {
			expect(isLaunchParamKey(key), key).toBe(false);
		}
	});
});
