// @vitest-environment node
// The static head is hand-written, so its own claims are the thing to
// pin: the title rsbuild injects must be the one the template already
// carries, and every unhashed file the head points at must exist. Under
// the SPA fallback a missing icon is not a 404, it is index.html served
// as an image.
import { access, readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import { SITE_TITLE } from "../../rsbuild.config.ts";

const ORIGIN = "https://inspect.vkma.dev";

const template = await readFile(new URL("./index.html", import.meta.url), "utf8");

/** Absolute paths the head points at, with the site origin stripped. */
function linkedPaths(): string[] {
	const values = [...template.matchAll(/(?:href|content)="([^"]+)"/g)].map(match => match[1]);
	return values
		.filter(value => value.startsWith(`${ORIGIN}/`) || value.startsWith("/"))
		.map(value => (value.startsWith(ORIGIN) ? value.slice(ORIGIN.length) : value))
		.filter(path => /^\/[^/]+$/.test(path));
}

it("the template's <title> is the one rsbuild is configured to inject", () => {
	expect(template).toContain(`<title>${SITE_TITLE}</title>`);
	expect(template).toContain(`property="og:title" content="${SITE_TITLE}"`);
});

it("every file the head links or shares exists in public/", async () => {
	const paths = linkedPaths();
	expect(paths).toEqual(
		expect.arrayContaining([
			"/icon.svg",
			"/favicon-96.png",
			"/og.png",
			"/apple-touch-icon.png",
		]),
	);
	for (const path of paths) {
		await expect(
			access(new URL(`.${path}`, new URL("../../public/", import.meta.url))),
		).resolves.toBeUndefined();
	}
});
