import { existsSync, readdirSync, rmdirSync } from "node:fs";
import { renameSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { unified, rehypeHeadingIds } from "@astrojs/markdown-remark";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import { PACKAGES } from "./sections.mjs";
import { rehypeProse } from "./src/plugins/rehype-prose";
import { remarkCodeBlocks } from "./src/plugins/remark-code-blocks";

// The English 404 has to be a literal `en/404.html`: the hoster answers a
// missing `/en/…` path with the nearest 404.html, and the directory format
// would give it the Russian one at the root. Starlight only ever built the
// Russian page as a file.
function nested404() {
	return {
		name: "vkma:nested-404",
		hooks: {
			"astro:build:done": ({ dir }) => {
				const from = new URL("en/404/index.html", dir);
				if (!existsSync(from)) {
					return;
				}
				renameSync(from, new URL("en/404.html", dir));
				rmdirSync(dirname(fileURLToPath(from)));
			},
		},
	};
}

const docsDir = fileURLToPath(new URL("./src/content/docs/", import.meta.url));
const mdFiles = dir =>
	readdirSync(dir, { withFileTypes: true }).filter(
		entry => entry.isFile() && entry.name.endsWith(".md"),
	).length;

export default defineConfig({
	site: "https://vkma.dev",
	// hover-prefetch every link: navigations serve from the memory cache
	// instead of re-fetching, which shrinks the blank frame between loads
	prefetch: { prefetchAll: true, defaultStrategy: "hover" },
	// ru is the root locale (no prefix), en lives under /en/
	i18n: {
		defaultLocale: "ru",
		locales: ["ru", "en"],
		routing: { prefixDefaultLocale: false },
	},
	integrations: [
		sitemap({ i18n: { defaultLocale: "ru", locales: { ru: "ru", en: "en" } } }),
		nested404(),
	],
	markdown: {
		// code is highlighted inside remarkCodeBlocks (it owns the whole figure)
		syntaxHighlight: false,
		processor: unified({
			remarkPlugins: [remarkCodeBlocks],
			// heading ids come first so the prose plugin can anchor to them
			rehypePlugins: [
				rehypeHeadingIds,
				[
					rehypeProse,
					{
						pkgCounts: Object.fromEntries(
							PACKAGES.map(dir => [dir, mdFiles(docsDir + dir)]),
						),
					},
				],
			],
		}),
	},
});
