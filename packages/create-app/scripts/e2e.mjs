import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * End-to-end template check: scaffold every preset through the built CLI,
 * install its dependencies and run its build (tsc --noEmit + vite build).
 * Requires `pnpm build` first — it runs dist/cli.js against the registry.
 */
const presets = ["base", "vkui", "router"];
const root = mkdtempSync(join(tmpdir(), "vkma-create-app-e2e-"));

let failed = false;
for (const preset of presets) {
	const dir = join(root, preset);

	console.log(`\n=== ${preset}: scaffold ===`);
	const scaffold = spawnSync(
		process.execPath,
		["dist/cli.js", dir, "--preset", preset, "--pm", "pnpm", "--no-install", "--no-git"],
		{ stdio: "inherit" },
	);
	if (scaffold.status !== 0) {
		failed = true;
		continue;
	}

	console.log(`\n=== ${preset}: install ===`);
	const install = spawnSync("pnpm", ["install", "--dir", dir], { stdio: "inherit" });
	if (install.status !== 0) {
		failed = true;
		continue;
	}

	console.log(`\n=== ${preset}: build ===`);
	const build = spawnSync("pnpm", ["--dir", dir, "run", "build"], { stdio: "inherit" });
	if (build.status !== 0) {
		failed = true;
	}
}

process.exit(failed ? 1 : 0);
