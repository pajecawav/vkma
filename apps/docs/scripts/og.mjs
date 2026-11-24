/**
 * Renders the social preview card, scripts/og.html -> public/og.png.
 *
 *   pnpm og
 *
 * The card is the og:image astro.config.mjs points social networks at
 * (1200x630). To change it, edit og.html, run this, commit the PNG;
 * tests/og.test.ts fails when the two differ.
 *
 * Both of the card's fonts come from the @fontsource-variable package the
 * site itself loads, so the card and the pages cannot drift apart. The
 * subtitle takes Inter at its text optical size, the title at its display
 * one (the opsz file). The roster is set in takumi's built-in Geist.
 */
import { readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { render } from "takumi-js";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const interFile = name =>
	readFile(new URL(import.meta.resolve(`@fontsource-variable/inter/files/${name}.woff2`)));

/** The card as PNG bytes. */
export async function renderOgImage() {
	const html = await readFile(new URL("./og.html", import.meta.url), "utf8");
	return render(html, {
		width: OG_WIDTH,
		height: OG_HEIGHT,
		fonts: [
			{ name: "Inter", data: await interFile("inter-latin-wght-normal") },
			{ name: "Inter", data: await interFile("inter-cyrillic-wght-normal") },
			{ name: "Inter Display", data: await interFile("inter-latin-opsz-normal") },
		],
	});
}

// Run as a script (`node scripts/og.mjs`), not when imported by the test.
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	await writeFile(new URL("../public/og.png", import.meta.url), await renderOgImage());
}
