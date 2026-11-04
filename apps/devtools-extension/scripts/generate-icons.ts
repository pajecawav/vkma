/**
 * Renders the extension launcher icons from the shared VkmaLogoIcon
 * glyph (@vkma.dev/ui/logo-path, the same path the panel draws), so the
 * launcher icon and the panel icon never drift. Run: `pnpm gen:icons`.
 * The generated PNGs are committed; this is a manual step, not a build step.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { Resvg } from "@resvg/resvg-js";
import { VKMA_LOGO_PATH } from "@vkma.dev/ui/logo-path";

const SIZES = [16, 48, 128] as const;

for (const size of SIZES) {
	// Transparent background, near-black glyph outline, the vk-mini-app-spy
	// treatment: the toolbar surface shows through, no tile of any kind.
	const svg =
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}">` +
		`<path fill="#171717" d="${VKMA_LOGO_PATH}"/>` +
		`</svg>`;
	const png = new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
	const out = new URL(`../src/icons/icon${size}.png`, import.meta.url);
	mkdirSync(new URL("../src/icons", import.meta.url), { recursive: true });
	writeFileSync(out, png);
	console.log(`icon${size}.png`, png.length, "bytes");
}
