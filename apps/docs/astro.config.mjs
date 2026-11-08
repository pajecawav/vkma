import starlight from "@astrojs/starlight";
import { defineConfig } from "astro/config";
import { SECTIONS } from "./sections.mjs";

const sidebar = SECTIONS.map(section => ({
	label: section.label,
	translations: section.translations,
	items: [
		...(section.root ? [{ slug: "index" }] : []),
		// one nested, collapsed subgroup per package: Пакеты → create-app →
		// its pages (the package index sorts first via sidebar.order 0)
		...section.dirs.map(directory => ({
			label: directory,
			collapsed: true,
			items: [{ autogenerate: { directory } }],
		})),
	],
}));

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
