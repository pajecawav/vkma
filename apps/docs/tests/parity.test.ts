// What the move off Starlight must not lose: the SEO head, the locale wiring,
// the search index, the 404s and the code chrome. Run `pnpm build` first —
// these read dist/, which only exists after a build.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dist = new URL("../dist", import.meta.url).pathname;
const page = (rel: string) => readFileSync(join(dist, rel), "utf8");
const head = (html: string) => html.slice(html.indexOf("<head>"), html.indexOf("</head>"));

/** @returns {string[]} every HTML page under dist (the 404 files included) */
function pages(dir = dist, prefix = ""): string[] {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			if (entry.name === "pagefind" || entry.name === "_astro") {
				continue;
			}
			out.push(...pages(join(dir, entry.name), rel));
		} else if (rel.endsWith(".html")) {
			out.push(rel);
		}
	}
	return out;
}

const every = pages();

describe("head", () => {
	it("every page declares a locale and a title with the site name", () => {
		expect(every.length).toBeGreaterThan(70);
		for (const rel of every) {
			const html = page(rel);
			expect(html, rel).toMatch(/^<!doctype html><html lang="(ru|en)" dir="ltr"/i);
			expect(html, rel).toMatch(/<title>.+ \| vkma\.dev<\/title>/);
		}
	});

	it("links the canonical URL and both translations", () => {
		for (const [rel, canonical] of [
			["bridge/index.html", "https://vkma.dev/bridge/"],
			["en/bridge/index.html", "https://vkma.dev/en/bridge/"],
			["index.html", "https://vkma.dev/"],
			["en/index.html", "https://vkma.dev/en/"],
		] as const) {
			const h = head(page(rel));
			expect(h, rel).toContain(`<link rel="canonical" href="${canonical}">`);
			for (const lang of ["ru", "en", "x-default"]) {
				expect(h, rel).toContain(`<link rel="alternate" hreflang="${lang}"`);
			}
			expect(h, rel).toContain(
				'<meta property="og:image" content="https://vkma.dev/og.png">',
			);
		}
	});

	it("sets the theme before the first stylesheet loads (no flash)", () => {
		for (const rel of every) {
			const h = head(page(rel));
			const theme = h.indexOf("vkma-theme");
			expect(theme, rel).toBeGreaterThan(-1);
			expect(theme, rel).toBeLessThan(h.indexOf('rel="stylesheet"'));
		}
	});

	it("the sitemap lists every page with its hreflang alternates", () => {
		const xml = page("sitemap-0.xml");
		const locs = xml.match(/<loc>[^<]+<\/loc>/g) ?? [];
		// the 404 pages are not routes
		expect(locs.length).toBe(every.length - 2);
		expect(xml.match(/<xhtml:link rel="alternate" hreflang="en"/g)?.length).toBe(locs.length);
	});
});

describe("search", () => {
	it("is indexed per language next to the pages", () => {
		const files = readdirSync(join(dist, "pagefind"));
		expect(files).toContain("pagefind.js");
		expect(files.some(file => /^pagefind\.ru_.*\.pf_meta$/.test(file))).toBe(true);
		expect(files.some(file => /^pagefind\.en_.*\.pf_meta$/.test(file))).toBe(true);
	});
});

describe("404", () => {
	it("is a literal file for both locales", () => {
		// the hoster answers a missing path with the nearest 404.html
		expect(existsSync(join(dist, "404.html"))).toBe(true);
		expect(existsSync(join(dist, "en/404.html"))).toBe(true);
		expect(page("404.html")).toMatch(/<html lang="ru"/);
		expect(page("en/404.html")).toMatch(/<html lang="en"/);
	});
});

describe("code chrome", () => {
	it("turns the npm-plus-alternatives convention into package-manager tabs", () => {
		const html = page("bridge/index.html");
		expect(html).toContain('role="tablist"');
		expect(html.match(/role="tab"/g)?.length).toBe(4);
		for (const pm of ["npm", "pnpm", "yarn", "bun"]) {
			expect(html).toContain(`data-pm="${pm}"`);
		}
		// the highlighter splits the command into spans: compare as text
		const text = html.replace(/<[^>]+>/g, "");
		expect(text).toContain("pnpm add @vkma.dev/bridge");
		expect(text).not.toContain("# или:");
	});

	it("turns a file-name comment into the block header", () => {
		const html = page("index.html");
		expect(html).toContain('<span class="code-name">vite.config.ts</span>');
		expect(html).not.toContain("// vite.config.ts");
	});

	it("links the edit button at the source file", () => {
		expect(page("bridge/index.html")).toContain(
			'href="https://github.com/pajecawav/vkma/edit/master/apps/docs/src/content/docs/bridge/index.md"',
		);
	});
});
