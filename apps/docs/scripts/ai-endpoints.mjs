// Post-build AI endpoints. Runs after `astro build` (see package.json) and
// adds to dist/:
//
//   - /foo.md — the page's markdown source, byte-exact. The rule is "the
//     page URL without the trailing slash, plus .md": /bridge/ → /bridge.md,
//     /bridge/usage/ → /bridge/usage.md, /en/ → /en.md. The homepage is
//     /index.md.
//   - llms.txt — the per-locale index of pages (llmstxt.org shape), grouped
//     by the same sections as the sidebar (sections.mjs).
//   - llms-full.txt — every page concatenated (frontmatter stripped, each
//     page prefixed with its title and source URL).
//
// The contract is pinned by tests/ai-endpoints.test.ts.
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { SITE, SECTIONS } from "../sections.mjs";

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const srcDir = join(appRoot, "src", "content", "docs");
const distDir = join(appRoot, "dist");

/** @returns {string[]} absolute paths of every .md under dir */
function walk(dir) {
	const out = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...walk(full));
		} else if (entry.name.endsWith(".md")) {
			out.push(full);
		}
	}
	return out;
}

/** Minimal frontmatter read: title, description, sidebar.order. */
function parseFrontmatter(source) {
	const block = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
	if (!block) {
		return { title: "", description: "", order: 0, body: source };
	}
	const yaml = block[1];
	const unquote = value => value.trim().replace(/^["'](.*)["']$/s, "$1");
	const title = unquote(yaml.match(/^title:\s*(.+)$/m)?.[1] ?? "");
	const description = unquote(yaml.match(/^description:\s*(.+)$/m)?.[1] ?? "");
	const order = Number(
		yaml.match(/^sidebar:\s*\n(?:[ \t]+.*\n)*?[ \t]+order:\s*(\d+)/m)?.[1] ?? 0,
	);
	return { title, description, order, body: source.slice(block[0].length) };
}

/**
 * One docs page. `rel` is the source path relative to src/content/docs/
 * with forward slashes: "index.md", "bridge/usage.md", "en/bridge/usage.md".
 */
function page(rel) {
	const locale = rel.startsWith("en/") ? "en" : "ru";
	const pageRel = locale === "en" ? rel.slice(3) : rel;
	const source = readFileSync(join(srcDir, rel), "utf8");
	const fm = parseFrontmatter(source);

	// index.md collapses onto its directory: bridge/index.md → /bridge
	// (HTML at dist/bridge/index.html, markdown at dist/bridge.md).
	// urlPath is the page URL without the domain and trailing slash;
	// the markdown file is urlPath + ".md", the homepage being index.md.
	const isIndex = pageRel === "index.md" || pageRel.endsWith("/index.md");
	const slug = isIndex
		? pageRel === "index.md"
			? ""
			: pageRel.slice(0, -"/index.md".length)
		: pageRel.replace(/\.md$/, "");
	const urlPath = `${locale === "en" ? "en/" : ""}${slug}`.replace(/\/$/, "");
	const distRel = urlPath === "" ? "index.md" : `${urlPath}.md`;

	return {
		rel,
		locale,
		title: fm.title,
		description: fm.description,
		order: fm.order,
		body: fm.body,
		sectionDir: slug === "" ? "" : slug.split("/")[0],
		htmlUrl: `${SITE}/${urlPath === "" ? "" : `${urlPath}/`}`,
		mdUrl: `${SITE}/${distRel}`,
		mdDistPath: join(distDir, distRel),
	};
}

// src/content/docs/404.md renders at /404.html, not its own route — the
// 404 pages are excluded from the .md endpoint contract.
const pages = walk(srcDir)
	.map(abs => page(relative(srcDir, abs).split("\\").join("/")))
	.filter(p => !p.rel.endsWith("404.md"));

// 1. byte-exact .md copies
for (const p of pages) {
	mkdirSync(dirname(p.mdDistPath), { recursive: true });
	copyFileSync(join(srcDir, p.rel), p.mdDistPath);
}

// 2. section grouping shared by llms.txt and llms-full.txt (sidebar order)
function sectionPages(locale) {
	return SECTIONS.map(section => {
		const group = [];
		if (section.root) {
			group.push(...pages.filter(p => p.locale === locale && p.slug === ""));
		}
		for (const dir of section.dirs) {
			group.push(
				...pages
					.filter(p => p.locale === locale && p.sectionDir === dir)
					.toSorted((a, b) => a.order - b.order || a.slug.localeCompare(b.slug)),
			);
		}
		return { section, group };
	});
}

function label(section, locale) {
	return locale === "en" ? (section.translations?.en ?? section.label) : section.label;
}

function renderLlms(locale) {
	const summary =
		locale === "en"
			? "Tooling for VK Mini Apps: bridge, router, devtools, deploy and API schemas. Every page is also served as markdown at its URL plus `.md`."
			: "Инструменты для VK Mini Apps: мост, роутер, devtools, деплой и схемы. Каждая страница доступна как markdown по своему URL плюс `.md`.";
	const lines = ["# vkma.dev", "", `> ${summary}`, ""];
	for (const { section, group } of sectionPages(locale)) {
		if (group.length === 0) {
			continue;
		}
		lines.push(`## ${label(section, locale)}`, "");
		for (const p of group) {
			lines.push(`- [${p.title}](${p.mdUrl})${p.description ? `: ${p.description}` : ""}`);
		}
		lines.push("");
	}
	const other = locale === "en" ? "Русская версия" : "English docs";
	const otherUrl = locale === "en" ? `${SITE}/llms.txt` : `${SITE}/en/llms.txt`;
	lines.push(`## ${other}`, "", `- [${other}](${otherUrl})`, "");
	return `${lines.join("\n")}\n`;
}

function renderLlmsFull(locale) {
	const header =
		locale === "en"
			? "# vkma.dev — full documentation dump"
			: "# vkma.dev — полная документация одним файлом";
	const parts = [header, ""];
	for (const { group } of sectionPages(locale)) {
		for (const p of group) {
			parts.push(
				"---",
				"",
				`# ${p.title}`,
				"",
				`Source: ${p.htmlUrl}`,
				"",
				p.body.trim(),
				"",
			);
		}
	}
	return `${parts.join("\n")}\n`;
}

writeFileSync(join(distDir, "llms.txt"), renderLlms("ru"));
writeFileSync(join(distDir, "llms-full.txt"), renderLlmsFull("ru"));
mkdirSync(join(distDir, "en"), { recursive: true });
writeFileSync(join(distDir, "en", "llms.txt"), renderLlms("en"));
writeFileSync(join(distDir, "en", "llms-full.txt"), renderLlmsFull("en"));

console.log(`ai-endpoints: ${pages.length} markdown copies + llms.txt/llms-full.txt (ru, en)`);
