/**
 * Renders the panel favicons from the shared VkmaLogoIcon glyph
 * (@vkma.dev/ui/logo-path — the same path the panel draws), so the tab
 * icon and the panel icon never drift. Run: `pnpm gen:favicon`.
 * The generated SVGs are committed — this is not a build step.
 *
 * The extension-launcher treatment (transparent background, no tile,
 * near-black glyph) — except a favicon sits on both light and dark tab
 * strips, so the glyph ships twice and the browser picks by color
 * scheme.
 */
import { writeFileSync } from "node:fs";
import { VKMA_LOGO_PATH } from "@vkma.dev/ui/logo-path";

const favicon = (fill: string): string =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">\n\t<path fill="${fill}" d="${VKMA_LOGO_PATH}"/>\n</svg>\n`;

// Named icon.*, not favicon.*: rsbuild auto-injects a media-less <link>
// for any public/favicon.{ico,png,svg} it finds — that would shadow the
// dark color-scheme variant linked from the HTML template.
const write = (name: string, fill: string): void => {
	writeFileSync(new URL(`../public/${name}`, import.meta.url), favicon(fill));
	console.log(name, "written");
};

// neutral-900 / neutral-100 — the panel's own ink and paper.
write("icon.svg", "#171717");
write("icon-dark.svg", "#fafafa");
