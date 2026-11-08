// Contract tests for the AI layer. Run `pnpm build` first: these assert
// against dist/, which only exists after a build (same deal as the
// generated-schema packages — fresh clones build before testing).
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const dist = new URL("../dist", import.meta.url).pathname;

/** @returns {string[]} relative paths of every file under dist */
function walkDist(dir = dist, prefix = "") {
	const out: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
		if (entry.isDirectory()) {
			out.push(...walkDist(join(dir, entry.name), rel));
		} else {
			out.push(rel);
		}
	}
	return out;
}

const files = walkDist();
const htmlPages = files.filter(
	f =>
		f.endsWith("index.html") &&
		!f.startsWith("pagefind/") &&
		// 404 pages render outside the .md endpoint contract (no /404.md)
		f !== "404.html" &&
		!f.endsWith("/404.html") &&
		!f.endsWith("/404/index.html"),
);

/** dist/foo/index.html → dist/foo.md; dist/index.html → dist/index.md */
function mdCounterpart(htmlRel: string) {
	const page = htmlRel.slice(0, -"index.html".length);
	if (page === "") {
		return "index.md";
	}
	if (page.endsWith("/")) {
		return `${page.slice(0, -1)}.md`;
	}
	return `${page}.md`;
}

describe("markdown endpoints", () => {
	it("every HTML page has a .md counterpart", () => {
		expect(htmlPages.length).toBeGreaterThan(5);
		for (const html of htmlPages) {
			const md = mdCounterpart(html);
			expect(files, `${html} → ${md}`).toContain(md);
		}
	});

	it("every .md file belongs to an HTML page (no orphans)", () => {
		const mds = files.filter(f => f.endsWith(".md"));
		for (const md of mds) {
			// bridge.md ↔ bridge/index.html, bridge/usage.md ↔
			// bridge/usage/index.html, index.md ↔ index.html
			const html = md === "index.md" ? "index.html" : `${md.replace(/\.md$/, "")}/index.html`;
			expect(files, `${md} → ${html}`).toContain(html);
		}
	});

	it("the .md copy is byte-exact (getting started, both locales)", () => {
		for (const src of ["index.md", "en/index.md"]) {
			const distMd = src === "index.md" ? "index.md" : "en.md";
			const source = readFileSync(
				new URL(`../src/content/docs/${src}`, import.meta.url).pathname,
			);
			expect(readFileSync(join(dist, distMd)).equals(source)).toBe(true);
		}
	});
});

describe("llms.txt", () => {
	it("exists for both locales and links only to existing .md files", () => {
		for (const llms of ["llms.txt", "en/llms.txt"]) {
			const content = readFileSync(join(dist, llms), "utf8");
			const links = [...content.matchAll(/\]\((https:\/\/vkma\.dev\/[^)]+)\)/g)].map(
				m => m[1],
			);
			expect(links.length).toBeGreaterThan(5);
			for (const link of links) {
				const rel = link.replace("https://vkma.dev/", "");
				if (rel.endsWith(".md")) {
					expect(files, `${llms} → ${rel}`).toContain(rel);
				} else {
					expect(existsSync(join(dist, rel))).toBe(true);
				}
			}
		}
	});

	it("llms-full.txt contains every page of its locale", () => {
		for (const [full, llms] of [
			["llms-full.txt", "llms.txt"],
			["en/llms-full.txt", "en/llms.txt"],
		] as const) {
			const fullContent = readFileSync(join(dist, full), "utf8");
			const index = readFileSync(join(dist, llms), "utf8");
			const links = [...index.matchAll(/\]\(https:\/\/vkma\.dev\/([^)]+\.md)\)/g)].map(
				m => m[1],
			);
			for (const rel of links) {
				// every indexed page is dumped: its title appears as a "# " heading
				const mdContent = readFileSync(join(dist, rel), "utf8");
				const title = (mdContent.match(/^title:\s*(.+)$/m)?.[1] ?? "")
					.trim()
					.replace(/^["'](.*)["']$/, "$1");
				expect(title, `${full} → ${rel}`).toBeTruthy();
				expect(fullContent).toContain(`# ${title}`);
			}
		}
	});
});

describe("seo files", () => {
	it("ships robots.txt and sitemap", () => {
		expect(files).toContain("robots.txt");
		expect(files).toContain("sitemap-index.xml");
		expect(statSync(join(dist, "robots.txt")).size).toBeGreaterThan(0);
	});
});
