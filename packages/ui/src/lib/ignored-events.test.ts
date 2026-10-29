import { describe, expect, it } from "vitest";
import {
	DEFAULT_IGNORED_EVENTS,
	DEFAULT_IGNORED_SETTINGS,
	ignoreName,
	type IgnoredEventsSettings,
	parseIgnoredSettings,
	resolveIgnoredNames,
} from "./ignored-events.ts";

describe("resolveIgnoredNames", () => {
	it("resolves the defaults when nothing is touched", () => {
		const names = resolveIgnoredNames(DEFAULT_IGNORED_SETTINGS);
		expect(names.size).toBe(DEFAULT_IGNORED_EVENTS.length);
		expect(names.has("vkwebappscrolltop")).toBe(true);
		expect(names.has("setsupportedhandlers")).toBe(true);
	});

	it("off hides a default, extra adds a name", () => {
		const names = resolveIgnoredNames({
			v: 1,
			enabled: true,
			off: ["VKWebAppScrollTop"],
			extra: ["VKWebAppGetUserInfo"],
		});
		expect(names.has("vkwebappscrolltop")).toBe(false);
		expect(names.has("vkwebappgetuserinfo")).toBe(true);
	});

	it("matches case-insensitively", () => {
		const names = resolveIgnoredNames({
			v: 1,
			enabled: true,
			off: [],
			extra: ["VKWebAppStorageSet"],
		});
		expect(names.has("vkwebappstorageset")).toBe(true);
	});
});

describe("parseIgnoredSettings", () => {
	it("absent input degrades to the defaults", () => {
		expect(parseIgnoredSettings(null)).toEqual(DEFAULT_IGNORED_SETTINGS);
		expect(parseIgnoredSettings(undefined)).toEqual(DEFAULT_IGNORED_SETTINGS);
	});

	it("corrupt JSON degrades to the defaults", () => {
		expect(parseIgnoredSettings("{oops")).toEqual(DEFAULT_IGNORED_SETTINGS);
		expect(parseIgnoredSettings("42")).toEqual(DEFAULT_IGNORED_SETTINGS);
		expect(parseIgnoredSettings('"null"')).toEqual(DEFAULT_IGNORED_SETTINGS);
	});

	it("a future version degrades to the defaults", () => {
		expect(parseIgnoredSettings({ v: 2, enabled: false, off: [], extra: ["X"] })).toEqual(
			DEFAULT_IGNORED_SETTINGS,
		);
	});

	it("parses a stored JSON string", () => {
		const settings = parseIgnoredSettings(
			JSON.stringify({ v: 1, enabled: false, off: ["VKWebAppScrollTop"], extra: [] }),
		);
		expect(settings).toEqual({
			v: 1,
			enabled: false,
			off: ["VKWebAppScrollTop"],
			extra: [],
		});
	});

	it("sanitizes hostile shapes: non-strings drop, duplicates and off-strays filter out", () => {
		const settings = parseIgnoredSettings({
			v: 1,
			enabled: "yes",
			off: ["VKWebAppScrollTop", "VKWebAppScrollTop", "NotADefault", 42],
			extra: ["StorageSet", "", "storageset", null],
		});
		expect(settings.enabled).toBe(true);
		expect(settings.off).toEqual(["VKWebAppScrollTop"]);
		expect(settings.extra).toEqual(["StorageSet"]);
	});
});

describe("ignoreName", () => {
	it("adds a new name to extra, trimmed", () => {
		const next = ignoreName(DEFAULT_IGNORED_SETTINGS, "  VKWebAppGetUserInfo  ");
		expect(next.extra).toEqual(["VKWebAppGetUserInfo"]);
	});

	it("re-enables a disabled default instead of duplicating it", () => {
		const disabled: IgnoredEventsSettings = {
			v: 1,
			enabled: true,
			off: ["VKWebAppScrollTop"],
			extra: [],
		};
		const next = ignoreName(disabled, "VKWebAppScrollTop");
		expect(next.off).toEqual([]);
		expect(next.extra).toEqual([]);
	});

	it("is a no-op for an already-ignored name (case-insensitive)", () => {
		const withExtra = ignoreName(DEFAULT_IGNORED_SETTINGS, "VKWebAppGetUserInfo");
		expect(ignoreName(withExtra, "vkwebappgetuserinfo")).toBe(withExtra);
	});

	it("ignores blank input", () => {
		expect(ignoreName(DEFAULT_IGNORED_SETTINGS, "   ")).toBe(DEFAULT_IGNORED_SETTINGS);
	});
});
