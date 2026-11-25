// @vitest-environment node
// Keeps the public/ icons in step with their source. The tab icon is the
// docs site's tile (one brand icon across the suite), and the committed
// rasters are what the shared glyph renders today. `pnpm gen:favicon`
// rewrites them.
import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { iconSvg, renderIconPng } from "./generate-favicon.ts";

const publicDir = new URL("../public/", import.meta.url);

it("icon.svg is the generator's output and the docs site's tile, byte for byte", async () => {
	const [ours, docs] = await Promise.all([
		readFile(new URL("icon.svg", publicDir)),
		readFile(new URL("../../docs/public/favicon.svg", import.meta.url)),
	]);
	expect(ours.toString()).toBe(iconSvg());
	expect(ours.equals(docs), "the tab icon drifted from apps/docs/public/favicon.svg").toBe(true);
});

it.each<[string, number, number]>([
	["favicon-96.png", 96, 12],
	["apple-touch-icon.png", 180, 0],
])("%s is what the glyph renders today", async (name, size, radius) => {
	const committed = await readFile(new URL(name, publicDir));
	expect(
		committed.equals(Buffer.from(renderIconPng(size, radius))),
		`${name} is stale: run \`pnpm gen:favicon\` after changing the icon source`,
	).toBe(true);
});
