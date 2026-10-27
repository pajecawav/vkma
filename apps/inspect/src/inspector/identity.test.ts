import { describe, expect, it } from "vitest";
import { createIdentity } from "./identity.ts";

/**
 * The hello payload's data minimization: the curated launch-params subset
 * is the ONLY page data that leaves in `url` — no foreign query params,
 * no fragment, ever.
 */

describe("identity url minimization", () => {
	it("collects the curated subset into launchParams", () => {
		window.location.href =
			"https://app.example.com/app/?vk_app_id=1&sign=LEAKED&api_url=https%3A%2F%2Fapi.vk.com&code=OAUTH&email=x%40y.z#access_token=TOKEN";
		const identity = createIdentity(() => {});
		expect(Object.keys(identity.launchParams).sort()).toEqual(["api_url", "sign", "vk_app_id"]);
	});

	it("clientInfo.url carries only the filtered params and no fragment", () => {
		window.location.href =
			"https://app.example.com/app/?vk_app_id=1&sign=LEAKED&code=OAUTH&email=x%40y.z#access_token=TOKEN";
		const info = createIdentity(() => {}).clientInfo(false);
		const url = new URL(info.url);
		expect(url.hash).toBe("");
		expect(url.searchParams.has("sign")).toBe(true);
		expect(url.searchParams.has("code")).toBe(false);
		expect(url.searchParams.has("email")).toBe(false);
		expect(info.url).not.toContain("access_token");
		expect(info.url).not.toContain("OAUTH");
	});

	it("re-sampling follows the live path; the query stays the curated snapshot", () => {
		const identity = createIdentity(() => {});
		window.location.href = "https://app.example.com/other/?vk_app_id=2";
		const info = identity.clientInfo(false);
		const url = new URL(info.url);
		// the locator follows the page (SPA route changes ship on heartbeats)
		expect(url.pathname).toBe("/other/");
		// the query is rebuilt from the launchParams SNAPSHOT taken at
		// load — foreign params of a later url must not leak in either
		expect(url.searchParams.get("vk_app_id")).toBe("1");
	});
});
