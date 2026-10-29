export const PACKAGE_MANAGERS = ["npm", "pnpm", "yarn", "bun"] as const;
export type PackageManager = (typeof PACKAGE_MANAGERS)[number];

/**
 * The invoking command sets `npm_config_user_agent` (`pnpm/10 … node/26 …`).
 * It is the only reliable signal when running under `npm create` /
 * `pnpm create` / `yarn create` / `bunx`.
 */
export function detectPackageManager(userAgent: string | undefined): PackageManager | null {
	if (!userAgent) {
		return null;
	}
	const name = userAgent.split(" ")[0]?.split("/")[0];
	if (name === undefined) {
		return null;
	}
	return (PACKAGE_MANAGERS as readonly string[]).includes(name) ? (name as PackageManager) : null;
}

export function isPackageManager(value: string): value is PackageManager {
	return (PACKAGE_MANAGERS as readonly string[]).includes(value);
}

/** The dependency-install command for a package manager (same shape for all). */
export function installCommand(pm: PackageManager): { command: string; args: string[] } {
	return { command: pm, args: ["install"] };
}

/** The user-facing `dev`/`build`/… invocation string for the next-steps hint. */
export function runCommand(pm: PackageManager, script: string): string {
	switch (pm) {
		case "npm":
			return `npm run ${script}`;
		case "pnpm":
			return `pnpm ${script}`;
		case "yarn":
			return `yarn ${script}`;
		case "bun":
			return `bun run ${script}`;
	}
}
