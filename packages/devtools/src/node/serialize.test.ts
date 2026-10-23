import { describe, expect, it } from "vitest";
import { sanitizeEvent, toMcpJson, UNSERIALIZABLE } from "./serialize.ts";

describe("toMcpJson", () => {
	it("passes plain JSON data through unchanged", () => {
		expect(toMcpJson({ a: 1, b: ["x", null] })).toEqual({ a: 1, b: ["x", null] });
	});

	it("silently flattens Maps and Sets like JSON.stringify does", () => {
		expect(toMcpJson({ m: new Map([[1, 2]]), s: new Set([3]) })).toEqual({
			m: {},
			s: {},
		});
	});

	it("degrades cyclic structures to the marker instead of throwing", () => {
		const cyclic: Record<string, unknown> = {};
		cyclic["self"] = cyclic;
		expect(toMcpJson(cyclic)).toBe(UNSERIALIZABLE);
	});

	it("degrades BigInt to the marker", () => {
		expect(toMcpJson({ big: 1n })).toBe(UNSERIALIZABLE);
	});
});

describe("sanitizeEvent", () => {
	it("keeps events without a payload untouched (same reference)", () => {
		const event = { name: "VKWebAppInit", ts: 1 };
		expect(sanitizeEvent(event)).toBe(event);
	});

	it("sanitizes only the payload", () => {
		const event = { name: "send", payload: new Map([[1, 2]]) };
		expect(sanitizeEvent(event)).toEqual({ name: "send", payload: {} });
	});
});
