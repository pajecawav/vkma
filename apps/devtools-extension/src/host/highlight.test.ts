import type { ClientStatus } from "@vkma.dev/protocol";
import { describe, expect, it } from "vitest";
import { matchClientFrames, scoreMatch } from "./highlight.ts";

const client = (url: string): Pick<ClientStatus, "url"> => ({ url });

/**
 * A minimal document fake: matchClientFrames touches only
 * `querySelectorAll("iframe")`, `getAttribute("src")` and `baseURI` —
 * a real DOM environment would buy nothing here.
 */
const documentWithFrames =
	(baseURI = "https://vk.com/page") =>
	(...srcs: Array<string | null>): Document => {
		const frames = srcs.map(src => ({
			getAttribute: (name: string) => (name === "src" ? src : null),
		}));
		return {
			baseURI,
			querySelectorAll: (selector: string) => (selector === "iframe" ? frames : []),
		} as unknown as Document;
	};

describe("frame URL matching", () => {
	it("scores exact href above pathname above origin", () => {
		const url = "https://prod-app123.pages-ac.vk.com/index.html?sign=s";
		expect(scoreMatch(url, url, "https://vk.com/")).toBe(3);
		// same path, different query — the frame re-navigated within its page
		expect(
			scoreMatch(
				"https://prod-app123.pages-ac.vk.com/index.html?x=1",
				url,
				"https://vk.com/",
			),
		).toBe(2);
		// same origin, different path
		expect(
			scoreMatch("https://prod-app123.pages-ac.vk.com/other.html", url, "https://vk.com/"),
		).toBe(1);
		expect(
			scoreMatch("https://evil.example.com/index.html?sign=s", url, "https://vk.com/"),
		).toBe(0);
	});

	it("resolves relative srcs against the host page base", () => {
		const doc = documentWithFrames("https://vk.com/")("app.html?sign=s");
		const matched = matchClientFrames(doc, client("https://vk.com/app.html?sign=s"));
		expect(matched).toHaveLength(1);
	});

	it("rejects opaque origins", () => {
		expect(scoreMatch("about:blank", "https://vk.com/app", "https://vk.com/")).toBe(0);
	});

	it("matches the exact-src frame over a same-origin sibling", () => {
		const doc = documentWithFrames()(
			"https://app.vk.com/other.html",
			"https://app.vk.com/app.html?sign=s",
		);
		const matched = matchClientFrames(doc, client("https://app.vk.com/app.html?sign=s"));
		expect(matched).toHaveLength(1);
		expect(matched[0]?.getAttribute("src")).toBe("https://app.vk.com/app.html?sign=s");
	});

	it("falls back to pathname when the frame re-navigated (src stayed behind)", () => {
		const doc = documentWithFrames()(
			"https://app.vk.com/app.html?stale=1",
			"https://app.vk.com/neighbor.html",
		);
		const matched = matchClientFrames(
			doc,
			client("https://app.vk.com/app.html?sign=s&vk_app_id=1"),
		);
		expect(matched).toHaveLength(1);
		expect(matched[0]?.getAttribute("src")).toBe("https://app.vk.com/app.html?stale=1");
	});

	it("highlights every frame of the same app", () => {
		const doc = documentWithFrames()(
			"https://app.vk.com/app.html?a=1",
			"https://app.vk.com/app.html?a=2",
		);
		expect(matchClientFrames(doc, client("https://app.vk.com/app.html"))).toHaveLength(2);
	});

	it("ignores src-less iframes and cross-origin frames", () => {
		const doc = documentWithFrames()(null, "https://ads.example.com/banner.html");
		expect(matchClientFrames(doc, client("https://app.vk.com/app.html"))).toHaveLength(0);
	});
});
