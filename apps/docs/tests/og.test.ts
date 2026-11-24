// Keeps public/og.png in step with its template: the committed image must
// be what scripts/og.html renders today. `pnpm og` rewrites it.
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { OG_HEIGHT, OG_WIDTH, renderOgImage } from "../scripts/og.mjs";

const committed = new URL("../public/og.png", import.meta.url);

it("public/og.png is what scripts/og.html renders", async () => {
	const rendered = Buffer.from(await renderOgImage());
	expect(
		(await readFile(committed)).equals(rendered),
		"public/og.png is stale: run `pnpm og` after changing scripts/og.html",
	).toBe(true);
});

it("the card is 1200x630, the size astro.config.mjs declares", async () => {
	// PNG header: width at bytes 16-19, height at 20-23, big-endian.
	const bytes = new Uint8Array(await renderOgImage());
	const header = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	expect([header.getUint32(16), header.getUint32(20)]).toEqual([OG_WIDTH, OG_HEIGHT]);
});
