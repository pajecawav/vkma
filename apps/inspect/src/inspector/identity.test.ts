import { describe, expect, it } from "vitest";
import { createIdentity } from "./identity.ts";

/**
 * The hello payload's data minimization: the curated launch-params subset
 * is the ONLY page data that leaves in `url`, no foreign query params,
 * no fragment, ever.
 */

describe("identity url minimization", () => {
	it("collects the curated subset into launchParams", () => {
		window.location.href =
			"https://app.example.com/app/?vk_app_id=1&sign=LEAKED&api_url=https%3A%2F%2Fapi.vk.com&code=OAUTH&email=x%40y.z#access_token=TOKEN";
		const identity = createIdentity(() => {});
		expect(Object.keys(identity.launchParams).toSorted()).toEqual([
			"api_url",
			"sign",
			"vk_app_id",
		]);
	});

	it("collects legacy (pre-vk_) game launch params and takes appId from api_id", () => {
		// the api.php-era shape games still launch with (tapclap & co)
		window.location.href =
			"https://gems2-vk-desktop.example.com/web/?hash=&api_url=https%3A%2F%2Fapi.vk.ru%2Fapi.php&api_id=3882511&api_settings=1&viewer_id=791264063&viewer_type=0&sid=vk1.a.frtM6kTdZ&secret=31c&access_token=vk1.a.nicEcFQni&user_id=0&is_app_user=1&language=0&is_secure=1&stats_hash=46cc&platform=web&is_widescreen=1&whitelist_scopes=notify,friends&auth_key=0eb8da6bbaad2&timestamp=1793347848&sign=UpASJ1uAL&sign_keys=api_id,viewer_id,sid&code=OAUTH&email=x%40y.z#frag=1";
		const identity = createIdentity(() => {});
		expect(identity.launchParams["api_id"]).toBe("3882511");
		expect(identity.launchParams["viewer_id"]).toBe("791264063");
		expect(identity.launchParams["sid"]).toBe("vk1.a.frtM6kTdZ");
		expect(identity.launchParams["secret"]).toBe("31c");
		expect(identity.launchParams["access_token"]).toBe("vk1.a.nicEcFQni");
		expect(identity.launchParams["sign_keys"]).toBe("api_id,viewer_id,sid");
		// foreign params never ride along, the minimization invariant
		expect(identity.launchParams["code"]).toBeUndefined();
		expect(identity.launchParams["email"]).toBeUndefined();
		// the app id falls back to the legacy api_id
		expect(identity.clientInfo(false).appId).toBe("3882511");
		// a VK-launched page is not "standalone" even without vk_app_id
		expect(identity.platform).not.toBe("standalone");
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
		// load. Foreign params of a later url must not leak in either
		expect(url.searchParams.get("vk_app_id")).toBe("1");
	});
});
