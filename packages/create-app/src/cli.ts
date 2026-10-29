#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import * as p from "@clack/prompts";
import { ArgsError, parseArgs } from "./args.ts";
import {
	detectPackageManager,
	installCommand,
	isPackageManager,
	runCommand,
	type PackageManager,
} from "./pm.ts";
import { DEFAULT_PRESET_ID, getPreset, PRESETS } from "./presets.ts";
import { scaffoldProject } from "./scaffold.ts";

const USAGE = `Usage: npm create @vkma.dev/app [path] [flags]

Presets: ${PRESETS.map(preset => preset.id).join(", ")}

Flags:
  --preset <id>   Preset to scaffold (default: ${DEFAULT_PRESET_ID})
  --pm <id>       Package manager: npm | pnpm | yarn | bun (detected from the
                  invoking command by default)
  --no-install    Skip installing dependencies
  --no-git        Skip git init
  -h, --help      Print this help`;

async function main(): Promise<number> {
	let args;
	try {
		args = parseArgs(process.argv.slice(2));
	} catch (error) {
		const message = error instanceof ArgsError ? error.message : String(error);
		console.error(`${message}\n\n${USAGE}`);
		return 1;
	}

	if (args.help) {
		console.log(USAGE);
		return 0;
	}

	const interactive = process.stdout.isTTY ?? false;
	p.intro("vkma · create a VK Mini App");

	// --- target directory -------------------------------------------------
	let targetRaw: string | null = args.targetDir;
	if (targetRaw === null && interactive) {
		const answer = await p.text({
			message: "Where should the app be created?",
			placeholder: ". (current directory)",
			defaultValue: ".",
		});
		if (p.isCancel(answer)) {
			return cancel();
		}
		targetRaw = answer;
	}
	const targetDir = resolve(process.cwd(), targetRaw ?? ".");

	if (existsSync(targetDir) && !(await isEmptyDir(targetDir))) {
		const proceed = interactive
			? await p.confirm({
					message: `Target directory is not empty (${targetDir}). Continue anyway?`,
					initialValue: true,
				})
			: false;
		if (p.isCancel(proceed)) {
			return cancel();
		}
		if (!proceed) {
			p.cancel("Target directory is not empty — nothing was written.");
			return 1;
		}
	}

	// --- preset ------------------------------------------------------------
	let preset = args.preset !== undefined ? getPreset(args.preset) : undefined;
	if (args.preset !== undefined && preset === undefined) {
		p.log.error(
			`Unknown preset "${args.preset}". Available: ${PRESETS.map(pr => pr.id).join(", ")}`,
		);
		return 1;
	}
	if (preset === undefined) {
		if (!interactive) {
			p.log.error(
				`Non-interactive run needs --preset (${PRESETS.map(pr => pr.id).join(", ")}).`,
			);
			return 1;
		}
		const answer = await p.select({
			message: "Pick a preset",
			initialValue: DEFAULT_PRESET_ID,
			options: PRESETS.map(pr => ({
				value: pr.id,
				label: pr.title,
				hint: pr.description,
			})),
		});
		if (p.isCancel(answer)) {
			return cancel();
		}
		preset = getPreset(answer);
		if (preset === undefined) {
			return cancel();
		}
	}

	// --- package manager ---------------------------------------------------
	let pm = args.pm !== undefined && isPackageManager(args.pm) ? args.pm : undefined;
	if (args.pm !== undefined && pm === undefined) {
		p.log.error(`Unknown package manager "${args.pm}". Available: npm, pnpm, yarn, bun.`);
		return 1;
	}
	if (pm === undefined) {
		pm = detectPackageManager(process.env["npm_config_user_agent"]) ?? undefined;
	}
	if (pm === undefined) {
		if (!interactive) {
			p.log.error("Could not detect a package manager — pass --pm <npm|pnpm|yarn|bun>.");
			return 1;
		}
		const answer = await p.select<PackageManager>({
			message: "Package manager",
			initialValue: "pnpm",
			options: [
				{ value: "pnpm", label: "pnpm", hint: "recommended" },
				{ value: "npm", label: "npm" },
				{ value: "yarn", label: "yarn" },
				{ value: "bun", label: "bun" },
			],
		});
		if (p.isCancel(answer)) {
			return cancel();
		}
		pm = answer;
	}

	// --- scaffold ------------------------------------------------------------
	const s = p.spinner();
	s.start(`Scaffolding preset "${preset.title}"…`);
	try {
		await scaffoldProject(targetDir, preset);
	} catch (error) {
		s.stop("Scaffolding failed");
		p.log.error(error instanceof Error ? error.message : String(error));
		return 1;
	}
	s.stop(`Scaffolded into ${targetDir}`);

	// --- install ------------------------------------------------------------
	if (args.install) {
		let doInstall = true;
		if (interactive) {
			const answer = await p.confirm({
				message: "Install dependencies?",
				initialValue: true,
			});
			if (p.isCancel(answer)) {
				return cancel();
			}
			doInstall = answer;
		}
		if (doInstall) {
			const { command, args: installArgs } = installCommand(pm);
			p.log.step(`Running ${command} ${installArgs.join(" ")}…`);
			const result = spawnSync(command, installArgs, { cwd: targetDir, stdio: "inherit" });
			if (result.status !== 0) {
				p.log.warn(`Install failed — run \`${command} install\` inside the project later.`);
			}
		}
	}

	// --- git -----------------------------------------------------------------
	if (args.git && !existsSync(resolve(targetDir, ".git"))) {
		let doInit = true;
		if (interactive) {
			const answer = await p.confirm({
				message: "Initialize a git repository?",
				initialValue: true,
			});
			if (p.isCancel(answer)) {
				return cancel();
			}
			doInit = answer;
		}
		if (doInit) {
			const result = spawnSync("git", ["init", "--quiet"], {
				cwd: targetDir,
				stdio: "ignore",
			});
			if (result.error !== undefined) {
				p.log.warn("git not found — skipped repository init.");
			}
		}
	}

	// --- next steps ------------------------------------------------------------
	p.log.message(`Next steps:
  cd ${targetDir}
  ${args.install ? "" : `${pm} install\n  `}${runCommand(pm, "dev")}

Deploy: set your appId in vkma-deploy.config.ts, authorize once with
  npx vkma-deploy login
then deploy with ${runCommand(pm, "deploy")}`);

	p.outro("Done — happy hacking!");
	return 0;
}

async function isEmptyDir(dir: string): Promise<boolean> {
	return (await readdir(dir)).length === 0;
}

function cancel(): number {
	p.cancel("Cancelled");
	return 1;
}

process.exit(await main());
