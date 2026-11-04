import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { getPreset, PRESETS } from "./presets.ts";
import { scaffoldProject, toPackageName } from "./scaffold.ts";

const root = await mkdtemp(join(tmpdir(), "vkma-create-app-test-"));

afterAll(async () => {
	await rm(root, { recursive: true, force: true });
});

async function walkFiles(dir: string): Promise<string[]> {
	const files: string[] = [];
	for (const entry of await readdir(dir, { withFileTypes: true })) {
		const path = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await walkFiles(path)));
		} else {
			files.push(path);
		}
	}
	return files;
}

interface GeneratedPackageJson {
	name: string;
	private: boolean;
	version: string;
	engines: { node: string };
	scripts: Record<string, string>;
	dependencies: Record<string, string>;
	devDependencies: Record<string, string>;
}

describe("scaffoldProject", () => {
	it("scaffolds every preset with merged deps, carets and no leftover tokens", async () => {
		for (const preset of PRESETS) {
			const target = join(root, `my cool app ${preset.id}`);
			const result = await scaffoldProject(target, preset);

			expect(result.appName).toBe(`my-cool-app-${preset.id}`);

			// --- assembled package.json ---
			const pkg = JSON.parse(
				await readFile(join(result.targetDir, "package.json"), "utf8"),
			) as GeneratedPackageJson;
			expect(pkg.name).toBe(`my-cool-app-${preset.id}`);
			expect(pkg.private).toBe(true);
			expect(pkg.engines.node).toBe(">=22.18.0");
			expect(pkg.scripts["deploy"]).toBe("vkma-deploy");

			// base stack present in every preset, caret-ranged
			for (const name of [
				"@vkma.dev/bridge",
				"@vkma.dev/devtools",
				"@vkma.dev/deploy",
				"react",
			]) {
				const version = pkg.dependencies[name] ?? pkg.devDependencies[name];
				expect(version, `${preset.id}:${name}`).toMatch(/^\^/);
			}

			// preset-specific deps
			if (preset.id === "vkui" || preset.id === "router") {
				expect(pkg.dependencies["@vkontakte/vkui"]).toMatch(/^\^/);
			}
			if (preset.id === "router") {
				expect(pkg.dependencies["@vkma.dev/router"]).toMatch(/^\^/);
				expect(pkg.dependencies["@tanstack/react-router"]).toMatch(/^\^/);
			}
			if (preset.id === "base") {
				expect(pkg.dependencies["@vkontakte/vkui"]).toBeUndefined();
			}

			// --- common files ---
			for (const file of [
				"index.html",
				"vite.config.ts",
				"tsconfig.json",
				"vkma-deploy.config.ts",
				".gitignore",
				"README.md",
			]) {
				expect(existsSync(join(result.targetDir, file)), `${preset.id}:${file}`).toBe(true);
			}

			// --- tokens substituted ---
			for (const file of await walkFiles(result.targetDir)) {
				const source = await readFile(file, "utf8");
				// (bare `{{` appears legitimately in JSX style objects)
				for (const token of ["{{appName}}", "{{appTitle}}", "{{presetTitle}}"]) {
					expect(source.includes(token), `${file}: ${token}`).toBe(false);
				}
			}

			// --- index.html title ---
			const html = await readFile(join(result.targetDir, "index.html"), "utf8");
			expect(html).toContain(`<title>my cool app ${preset.id}</title>`);

			// --- preset source shape ---
			if (preset.id === "router") {
				expect(existsSync(join(result.targetDir, "src/app.tsx"))).toBe(true);
				expect(existsSync(join(result.targetDir, "src/shell.tsx"))).toBe(true);
				expect(existsSync(join(result.targetDir, "src/App.tsx"))).toBe(false);
			}
			if (preset.id === "vkui") {
				const app = await readFile(join(result.targetDir, "src/App.tsx"), "utf8");
				expect(app).toContain("Epic");
			}
			// the base demo stylesheet survives only in the base preset
			expect(existsSync(join(result.targetDir, "src/App.css"))).toBe(preset.id === "base");
		}
	});

	it("overlays override base files (main.tsx)", async () => {
		const preset = getPreset("vkui")!;
		const target = join(root, "override-check");
		await scaffoldProject(target, preset);
		const main = await readFile(join(target, "src/main.tsx"), "utf8");
		expect(main).toContain("ConfigProvider");
	});
});

describe("toPackageName", () => {
	it("sanitizes directory names", () => {
		expect(toPackageName("My Cool App")).toBe("my-cool-app");
		expect(toPackageName("Привет")).toBe("vk-mini-app");
		expect(toPackageName("--app--")).toBe("app");
	});
});
