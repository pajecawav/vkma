import { describe, expect, it } from "vitest";
import { readHrefFromHash } from "./hash-params.ts";

const winWith = (hash: string): Window => ({ location: { hash } }) as unknown as Window;

describe("readHrefFromHash (legacy tolerance, both modes)", () => {
	it("reads the hash-param format", () => {
		expect(readHrefFromHash(winWith("#?path=%2Flist&utm=x"), "path")).toBe("/list");
	});

	it("reads legacy plain hashes (old createHashRouter links)", () => {
		expect(readHrefFromHash(winWith("#/item/7?tab=x"), "path")).toBe("/item/7?tab=x");
		expect(readHrefFromHash(winWith("#/"), "path")).toBe("/");
	});

	it("falls back to / for foreign or empty hashes", () => {
		expect(readHrefFromHash(winWith(""), "path")).toBe("/");
		expect(readHrefFromHash(winWith("#utm=x"), "path")).toBe("/");
	});
});
