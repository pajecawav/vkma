import { describe, expect, it } from "vitest";
import {
	parseHashLocation,
	parseHashPayload,
	serializeHashLocation,
	serializeHashPayload,
} from "./hash-params.ts";

const win = {
	location: {
		pathname: "/app.php",
		search: "?vk_platform=web&vk_app_id=1",
		hash: "#?path=%2Flist&utm_source=mail",
	},
} as unknown as Window;

describe("hash-param payload serialization", () => {
	it("preserves foreign hash params (UTM, launch fragments)", () => {
		const payload = serializeHashPayload(win, "path", "/item/7");
		expect(payload).toBe("?path=%2Fitem%2F7&utm_source=mail");
	});

	it("seeds the path param when the hash is empty", () => {
		const emptyWin = {
			location: { pathname: "/", search: "", hash: "" },
		} as unknown as Window;
		const payload = serializeHashPayload(emptyWin, "path", "/");
		expect(payload).toBe("?path=%2F");
	});

	it("parses the router href back out of a payload", () => {
		expect(parseHashPayload("?path=%2Fitem%2F7&utm_source=mail", "path")).toBe("/item/7");
		expect(parseHashPayload("path=/", "path")).toBe("/");
		expect(parseHashPayload("utm=x", "path")).toBe("/");
	});

	it("tolerates legacy plain-hash payloads (old createHashRouter hosts)", () => {
		expect(parseHashPayload("/item/7", "path")).toBe("/item/7");
	});
});

describe("hash mode location codecs", () => {
	it("serializes the location as the hash content", () => {
		expect(serializeHashLocation({ pathname: "/item/7", search: "?tab=x", hash: "" })).toBe(
			"/item/7?tab=x",
		);
		expect(serializeHashLocation({ pathname: "/", search: "", hash: "" })).toBe("/");
	});

	it("normalizes payloads to a leading slash", () => {
		expect(parseHashLocation("/list")).toBe("/list");
		expect(parseHashLocation("list")).toBe("/list");
	});
});
