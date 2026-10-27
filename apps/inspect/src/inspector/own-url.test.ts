import { describe, expect, it, vi } from "vitest";
import { peerIdFromUrl, resolveInspectorSourceUrl, signingKeyFromUrl } from "./own-url.ts";

const INSPECTOR_URL = "https://inspect.vkma.dev/inspector.js?id=vkma-inspect-abc123def456";

describe("resolveInspectorSourceUrl", () => {
	it("reads the classic tag through document.currentScript", () => {
		Object.defineProperty(document, "currentScript", {
			value: { src: INSPECTOR_URL },
			configurable: true,
		});
		try {
			expect(resolveInspectorSourceUrl()).toBe(INSPECTOR_URL);
		} finally {
			Object.defineProperty(document, "currentScript", { value: null, configurable: true });
		}
	});

	it("falls back to a script tag on the page (module import case)", () => {
		const element = document.createElement("script");
		element.src = INSPECTOR_URL;
		document.head.append(element);
		try {
			expect(resolveInspectorSourceUrl()).toBe(INSPECTOR_URL);
		} finally {
			element.remove();
		}
	});

	it("falls back to the resource timing entry (console import, no tag)", () => {
		const spy = vi
			.spyOn(performance, "getEntriesByType")
			.mockReturnValue([
				{ name: "https://cdn.example.com/app.js" },
				{ name: INSPECTOR_URL },
			] as never);
		try {
			expect(resolveInspectorSourceUrl()).toBe(INSPECTOR_URL);
		} finally {
			spy.mockRestore();
		}
	});

	it("ignores other file names", () => {
		const spy = vi
			.spyOn(performance, "getEntriesByType")
			.mockReturnValue([
				{ name: "https://x.example.com/libs/inspector.min.js" },
				{ name: "https://x.example.com/inspectorjsx" },
			] as never);
		try {
			expect(resolveInspectorSourceUrl()).toBeUndefined();
		} finally {
			spy.mockRestore();
		}
	});
});

describe("peerIdFromUrl", () => {
	it("extracts and validates the id", () => {
		expect(peerIdFromUrl(INSPECTOR_URL)).toBe("vkma-inspect-abc123def456");
	});

	it("rejects missing, too-short and hostile ids", () => {
		expect(peerIdFromUrl("https://x/inspector.js")).toBeUndefined();
		expect(peerIdFromUrl("https://x/inspector.js?id=short")).toBeUndefined();
		expect(peerIdFromUrl("https://x/inspector.js?id=" + "a".repeat(80))).toBeUndefined();
		expect(peerIdFromUrl("https://x/inspector.js?id=has%20space")).toBeUndefined();
	});

	it("rejects broken URLs", () => {
		expect(peerIdFromUrl("not a url")).toBeUndefined();
	});
});

describe("signingKeyFromUrl", () => {
	const key = "a".repeat(122); // SPKI P-256, base64url

	it("extracts the snippet's `k=` value", () => {
		expect(signingKeyFromUrl(`https://x/inspector.js?id=vkma-inspect-ab&k=${key}`)).toBe(key);
	});

	it("rejects missing and ill-shaped keys", () => {
		expect(signingKeyFromUrl("https://x/inspector.js?id=vkma-inspect-ab")).toBeUndefined();
		expect(signingKeyFromUrl("https://x/inspector.js?k=short")).toBeUndefined();
		expect(signingKeyFromUrl(`https://x/inspector.js?k=${"a".repeat(401)}`)).toBeUndefined();
		expect(signingKeyFromUrl("https://x/inspector.js?k=with%20space")).toBeUndefined();
	});
});
