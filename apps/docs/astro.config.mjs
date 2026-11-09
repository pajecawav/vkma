import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { PACKAGES } from "./sections.mjs";

// packages are top-level collapsed groups in PACKAGES order; the package
// index page sorts first inside its group via sidebar.order 0. The start
// page is a plain top-level link — its group wrapper would hold one item.
const sidebar = [
	{ slug: "index" },
	...PACKAGES.map(directory => ({
		label: directory,
		collapsed: true,
		items: [{ autogenerate: { directory } }],
	})),
];

export default defineConfig({
	site: "https://vkma.dev",
	// hover-prefetch every link: navigations serve from the memory cache
	// instead of re-fetching, which shrinks the blank frame between loads
	prefetch: { prefetchAll: true, defaultStrategy: "hover" },
	integrations: [
		starlight({
			title: "vkma.dev",
			description: "Инструменты для VK Mini Apps: мост, роутер, devtools, деплой и схемы",
			defaultLocale: "root",
			locales: {
				root: { label: "Русский", lang: "ru" },
				en: { label: "English" },
			},
			sidebar,
			customCss: [
				"@fontsource-variable/inter",
				"@fontsource-variable/geist-mono",
				"./src/styles/theme.css",
			],
			head: [
				// paint the pre-CSS blank canvas in the user's scheme instead
				// of the browser-default white — kills the white flash on
				// navigation for dark-theme readers
				{
					tag: "meta",
					attrs: { name: "color-scheme", content: "dark light" },
				},
				{
					tag: "meta",
					attrs: {
						name: "theme-color",
						media: "(prefers-color-scheme: dark)",
						content: "#120f1a",
					},
				},
				{
					tag: "meta",
					attrs: {
						name: "theme-color",
						media: "(prefers-color-scheme: light)",
						content: "#ffffff",
					},
				},
			],
			editLink: {
				baseUrl: "https://github.com/pajecawav/vkma/edit/master/apps/docs/src/content/docs",
			},
			social: [
				{
					icon: "github",
					label: "GitHub",
					href: "https://github.com/pajecawav/vkma",
				},
			],
		}),
	],
});
