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
			customCss: ["./src/styles/mono.css"],
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
