// The sidebar and llms.txt share this file: astro.config.mjs renders the
// sidebar from it, scripts/ai-endpoints.mjs renders llms.txt /
// llms-full.txt. Keep the two consumers in sync by editing this file only.
//
// Packages are TOP-LEVEL sidebar entries in this order — each directory
// becomes a collapsed group of its pages (page order comes from the
// `sidebar.order` frontmatter field). START owns the root pages (getting
// started).
export const SITE = "https://vkma.dev";

export const START = {
	label: "Основы",
	translations: { en: "Start Here" },
};

export const PACKAGES = [
	"create-app",
	"bridge",
	"router",
	"vkui-bridge",
	"devtools",
	"deploy",
	"bridge-schema",
	"api-schema",
];
