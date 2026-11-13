import { describe, expect, expectTypeOf, it } from "vitest";
import { type ParamsArg, splitVkLinkProps, vkLinkTarget } from "./link.tsx";

describe("vkLinkTarget", () => {
	it("index normalizes to /", () => {
		expect(vkLinkTarget({ path: "index" })).toBe("/");
	});

	it("leading slashes are normalized, the rest kept", () => {
		expect(vkLinkTarget({ path: "feed" })).toBe("/feed");
		expect(vkLinkTarget({ path: "/feed" })).toBe("/feed");
		expect(vkLinkTarget({ path: "post/$id" })).toBe("/post/$id");
	});
});

describe("splitVkLinkProps", () => {
	it("slices router options from host props, preload defaults to intent", () => {
		const split = splitVkLinkProps({
			page: { path: "post/$id" },
			params: { id: "1" },
			children: "Открыть",
			className: "my-link",
		});
		expect(split.to).toBe("/post/$id");
		expect(split.params).toEqual({ id: "1" });
		expect(split.preload).toBe("intent");
		expect(split.host).toEqual({ children: "Открыть", className: "my-link" });
	});

	it("an explicit preload and replace pass through", () => {
		const split = splitVkLinkProps({
			page: { path: "settings" },
			// a bare page carries no phantom: params stay required (safe
			// default — an empty record satisfies them)
			params: {},
			preload: false,
			replace: true,
		});
		expect(split.preload).toBe(false);
		expect(split.replace).toBe(true);
		expect(split.host).not.toHaveProperty("preload");
		expect(split.host).not.toHaveProperty("replace");
	});
});

describe("ParamsArg", () => {
	it("a keyed params type stays required, the loose default demands params", () => {
		expectTypeOf<ParamsArg<{ id: string }>>().toEqualTypeOf<{ id: string }>();
		// the loose default (a bare PanelPage) demands params
		expectTypeOf<ParamsArg<Record<string, string>>>().toEqualTypeOf<Record<string, string>>();
	});
});
