import { describe, expect, it } from "vitest";
import { compileNameFilter } from "./name-filter.ts";

describe("compileNameFilter", () => {
	it("empty query disables the filter", () => {
		expect(compileNameFilter("")).toBeUndefined();
		expect(compileNameFilter("   ")).toBeUndefined();
	});

	it("plain text matches as a case-insensitive substring", () => {
		const matches = compileNameFilter("userinfo")!;
		expect(matches("VKWebAppGetUserInfo")).toBe(true);
		expect(matches("vkwebappgetuserinfo")).toBe(true);
		expect(matches("VKWebAppShowWallPost")).toBe(false);
	});

	it("regex alternation matches either branch", () => {
		const matches = compileNameFilter("storage|photo")!;
		expect(matches("VKWebAppStorageSet")).toBe(true);
		expect(matches("VKWebAppPhotoPicker")).toBe(true);
		expect(matches("VKWebAppGetUserInfo")).toBe(false);
	});

	it("regex metacharacters work (wildcards, anchors)", () => {
		const wild = compileNameFilter("Get.*Info")!;
		expect(wild("VKWebAppGetPersonalInfo")).toBe(true);
		expect(wild("VKWebAppGetUserInfo")).toBe(true);
		expect(wild("VKWebAppInfoGet")).toBe(false);

		const anchored = compileNameFilter("^VKWebAppCopy")!;
		expect(anchored("VKWebAppCopyText")).toBe(true);
		expect(anchored("CustomVKWebAppCopy")).toBe(false);
	});

	it("an invalid regex degrades to substring matching", () => {
		const matches = compileNameFilter("GetUserInfo(")!;
		expect(matches("VKWebAppGetUserInfo(x")).toBe(true);
		expect(matches("VKWebAppGetUserInfo")).toBe(false);
	});
});
