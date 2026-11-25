/**
 * Renders the panel icons from the shared VkmaLogoIcon glyph
 * (@vkma.dev/ui/logo-path, the same path the panel draws), so the tab
 * icon and the panel icon never drift. Run: `pnpm gen:favicon`.
 * The generated files are committed (this is not a build step).
 *
 * The site's tile, the same markup as apps/docs/public/favicon.svg (a test
 * holds the two together): a dark rounded square under a white glyph. The
 * extension launcher's bare glyph disappeared on a dark tab strip, a tile
 * reads on any strip, and Safari, iOS home screens and Yandex take
 * rasters only. iOS paints black behind transparency and rounds the
 * corners itself, so its icon ships full-bleed.
 *
 * Named icon.svg, not favicon.svg: rsbuild injects a <link> of its own for
 * any public/favicon.{ico,png,svg} it finds, next to the one the template
 * writes. favicon-96.png does not match that pattern.
 */
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { Resvg } from "@resvg/resvg-js";
import { VKMA_LOGO_PATH } from "@vkma.dev/ui/logo-path";

const tile = (radius: number): string =>
	`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${radius}" fill="#111"/><path transform="translate(7.7 8.1) scale(2)" fill="#fff" d="${VKMA_LOGO_PATH}"/></svg>`;

/** The tab icon: the site's tile as SVG. */
export const iconSvg = (): string => `${tile(12)}\n`;

/** A raster of the tile at `size` px. Radius 0 gives the full-bleed iOS icon. */
export const renderIconPng = (size: number, radius = 12): Uint8Array =>
	new Resvg(tile(radius), { fitTo: { mode: "width", value: size } }).render().asPng();

const RASTERS = [
	{ name: "favicon-96.png", size: 96, radius: 12 },
	{ name: "apple-touch-icon.png", size: 180, radius: 0 },
] as const;

// Run as a script (`node scripts/generate-favicon.ts`), not when the parity
// test imports the renderers.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	const out = (name: string) => new URL(`../public/${name}`, import.meta.url);
	writeFileSync(out("icon.svg"), iconSvg());
	console.log("icon.svg written");
	for (const { name, size, radius } of RASTERS) {
		const png = renderIconPng(size, radius);
		writeFileSync(out(name), png);
		console.log(name, png.byteLength, "bytes");
	}
}
