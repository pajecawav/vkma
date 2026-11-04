import { describe, expect, it } from "vitest";
import type { PanelHandle } from "./builders.tsx";
import { deriveInflateChain } from "./inflate.ts";

const panel = (routeId: string, path: string): PanelHandle => ({
	routeId,
	path,
	viewId: "/view:main",
});

const panels = [
	panel("/view:main/", "/"),
	panel("/view:main/list", "/list"),
	panel("/view:main/item/$id", "/item/$id"),
	panel("/view:main/about", "/about"),
];

describe("deriveInflateChain", () => {
	it("builds the panel flow before the deep-linked panel", () => {
		const chain = deriveInflateChain(panels, "/view:main/item/$id", { id: "7" });
		expect(chain).toEqual(["/", "/list"]);
	});

	it("returns nothing for the first panel of the view", () => {
		expect(deriveInflateChain(panels, "/view:main/", {})).toEqual([]);
	});

	it("returns nothing for an unknown panel", () => {
		expect(deriveInflateChain(panels, "/elsewhere", {})).toEqual([]);
	});

	it("fills intermediate params and skips panels it cannot fill", () => {
		const withParams = [
			panel("/view:main/", "/"),
			panel("/view:main/wizard/$step", "/wizard/$step"),
			panel("/view:main/item/$id", "/item/$id"),
		];
		// target has {id} only: wizard/$step cannot be filled, skipped
		const chain = deriveInflateChain(withParams, "/view:main/item/$id", { id: "9" });
		expect(chain).toEqual(["/"]);
	});

	it("interpolates params into intermediate panels when available", () => {
		const withParams = [
			panel("/view:main/item/$id", "/item/$id"),
			panel("/view:main/item/$id/details", "/item/$id/details"),
		];
		const chain = deriveInflateChain(withParams, "/view:main/item/$id/details", {
			id: "7",
		});
		expect(chain).toEqual(["/item/7"]);
	});
});
