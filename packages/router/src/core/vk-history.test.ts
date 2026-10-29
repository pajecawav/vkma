import { describe, expect, it } from "vitest";
import { createVkHistory } from "./vk-history.ts";

describe("createVkHistory (hash mode)", () => {
	it("parseLocation resolves legacy #?path= deep links", () => {
		window.location.hash = "#?path=%2Fitem%2F7%3Ftab%3Dx";
		const { history } = createVkHistory();
		expect(history.location.pathname).toBe("/item/7");
		expect(history.location.search).toBe("?tab=x");
	});

	it("parseCurrentHash honors legacy #?path= deep links (parity with parseLocation)", () => {
		window.location.hash = "#?path=%2Fitem%2F7";
		const { parseCurrentHash } = createVkHistory();
		expect(parseCurrentHash()).toBe("/item/7");
	});

	it("parseCurrentHash reads plain hashes", () => {
		window.location.hash = "#/item/7?tab=x";
		const { parseCurrentHash } = createVkHistory();
		expect(parseCurrentHash()).toBe("/item/7?tab=x");
		window.location.hash = "#/";
		expect(parseCurrentHash()).toBe("/");
	});
});
