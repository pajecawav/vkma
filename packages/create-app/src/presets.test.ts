import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_PRESET_ID, getPreset, PRESETS, type Preset } from "./presets.ts";

const TEMPLATES_DIR = resolve(join(dirnameOf(import.meta.url), "..", "templates"));

function dirnameOf(url: string): string {
	return fileURLToPath(new URL(".", url));
}

describe("preset registry", () => {
	it("ids are unique and include the default", () => {
		const ids = PRESETS.map(preset => preset.id);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids).toContain(DEFAULT_PRESET_ID);
		expect(getPreset(DEFAULT_PRESET_ID)?.overlay).not.toBeNull();
	});

	it("overlay directories exist for non-base presets", () => {
		for (const preset of PRESETS) {
			if (preset.overlay === null) {
				continue;
			}
			expect(existsSync(join(TEMPLATES_DIR, preset.overlay)), preset.id).toBe(true);
		}
	});

	it("base template exists", () => {
		expect(existsSync(join(TEMPLATES_DIR, "base"))).toBe(true);
	});
});

interface Fragment {
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	scripts?: Record<string, string>;
}

async function readFragment(preset: Preset): Promise<Fragment> {
	const dir = preset.overlay ?? "base";
	return JSON.parse(await readFile(join(TEMPLATES_DIR, dir, "package.json"), "utf8")) as Fragment;
}

describe("template package.json fragments", () => {
	it("every dependency is an EXACT pin (Renovate bumps, carets are added at scaffold time)", async () => {
		for (const preset of PRESETS) {
			const fragment = await readFragment(preset);
			const versions = {
				...fragment.dependencies,
				...fragment.devDependencies,
			};
			for (const [name, version] of Object.entries(versions)) {
				// workspace: and catalog: never appear in shipped templates
				expect(version, `${preset.id}:${name}`).toMatch(/^\d+\.\d+\.\d+/);
			}
		}
	});

	it("every preset inherits the base runtime stack", async () => {
		const base = await readFragment(PRESETS[0]!);
		const baseDeps = Object.keys({
			...base.dependencies,
			...base.devDependencies,
		});
		for (const name of [
			"@vkma.dev/bridge",
			"@vkma.dev/deploy",
			"@vkma.dev/devtools",
			"react",
			"react-dom",
			"vite",
		]) {
			expect(baseDeps, name).toContain(name);
		}
	});
});
