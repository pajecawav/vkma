import { describe, expect, test } from "vitest";
import { injectSnippet } from "./inject-snippet.ts";

describe("injectSnippet", () => {
	test("without config it sets only the base global", () => {
		const snippet = injectSnippet("/__vkma/");
		expect(snippet).toContain('globalThis.__VKMA_DEVTOOLS_BASE__="/__vkma/"');
		expect(snippet).not.toContain("__VKMA_DEVTOOLS_CONFIG__");
		expect(snippet).toContain('"/__vkma/inject.js"');
	});

	test("fabPosition rides the config global as JSON", () => {
		const snippet = injectSnippet("/__vkma/", { fabPosition: "bottom-left" });
		expect(snippet).toContain(
			`globalThis.__VKMA_DEVTOOLS_CONFIG__=${JSON.stringify({ fabPosition: "bottom-left" })}`,
		);
	});

	test("undefined config values are dropped, not serialized", () => {
		const snippet = injectSnippet("/__vkma/", { fabPosition: undefined });
		expect(snippet).not.toContain("__VKMA_DEVTOOLS_CONFIG__");
		expect(snippet).toBe(injectSnippet("/__vkma/"));
	});

	test("the snippet stays a plain script: no import/export, DOM wait included", () => {
		for (const snippet of [
			injectSnippet("/__vkma/"),
			injectSnippet("/__vkma/", { fabPosition: "bottom" }),
		]) {
			expect(snippet).not.toMatch(/\b(import|export)\b/);
			expect(snippet).toContain("DOMContentLoaded");
		}
	});
});
