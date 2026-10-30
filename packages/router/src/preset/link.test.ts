import { describe, expect, it } from "vitest";
import { splitVkLinkProps, vkLinkTarget } from "./link.tsx";

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
			preload: false,
			replace: true,
		});
		expect(split.preload).toBe(false);
		expect(split.replace).toBe(true);
		expect(split.host).not.toHaveProperty("preload");
		expect(split.host).not.toHaveProperty("replace");
	});
});
