import { describe, expect, it } from "vitest";
import { mapLegacyConfig, LEGACY_CONFIG_FILENAME } from "./legacy.ts";

describe("mapLegacyConfig", () => {
	it("maps all known upstream fields", () => {
		const { config, warnings } = mapLegacyConfig({
			static_path: "./build",
			app_id: 42,
			endpoints: { mobile: "index.html", mvk: "index.html", web: "index.html" },
			access_token: "token-123456",
			update_prod: 1,
			update_dev: 0,
			test_group_name: "qa",
			api_host: "https://api.vk.ru/method/",
			oauth_host: "https://oauth.vk.ru/",
		});
		expect(config).toEqual({
			staticPath: "./build",
			appId: 42,
			endpoints: { mobile: "index.html", mvk: "index.html", web: "index.html" },
			accessToken: "token-123456",
			updateProd: true,
			updateDev: false,
			testGroupName: "qa",
			apiHost: "https://api.vk.ru/method/",
			oauthHost: "https://oauth.vk.ru/",
		});
		expect(warnings).toEqual([]);
	});

	it("supports the ancient staticpath alias and bundleFile", () => {
		const { config } = mapLegacyConfig({
			staticpath: "./dist",
			app_id: 1,
			bundleFile: "./b.zip",
		});
		expect(config.staticPath).toBe("./dist");
		expect(config.bundle).toBe("./b.zip");
	});

	it("accepts booleans for update flags", () => {
		const { config } = mapLegacyConfig({ app_id: 1, update_prod: true, update_dev: false });
		expect(config.updateProd).toBe(true);
		expect(config.updateDev).toBe(false);
	});

	it("rejects invalid update flag values like upstream 0.1.9+", () => {
		expect(() => mapLegacyConfig({ app_id: 1, update_prod: 5 })).toThrow(/update_prod/);
		expect(() => mapLegacyConfig({ app_id: 1, update_dev: "yes" })).toThrow(/update_dev/);
	});

	it("warns for ignored fields and unknown fields", () => {
		const { warnings } = mapLegacyConfig({
			app_id: 1,
			debug: true,
			noprompt: true,
			proxy_url: "http://proxy",
			expires_in: 123,
			mystery: 1,
		});
		const text = warnings.join("\n");
		expect(text).toContain("debug");
		expect(text).toContain("noprompt");
		expect(text).toContain("proxy_url");
		expect(text).toContain("expires_in");
		expect(text).toContain("mystery");
	});

	it("rejects non-object configs", () => {
		expect(() => mapLegacyConfig(null)).toThrow();
		expect(() => mapLegacyConfig([1])).toThrow();
	});

	it("legacy filename constant matches upstream", () => {
		expect(LEGACY_CONFIG_FILENAME).toBe("vk-hosting-config.json");
	});
});
