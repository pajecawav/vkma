/**
 * Browser opener, CLI-only by design (same policy as @vkma.dev/deploy).
 * The library layer never spawns processes.
 */

import { spawn } from "node:child_process";

/** The command that opens a URL on `platform`, with the arguments it takes. */
function openerFor(
	platform: NodeJS.Platform,
	url: string,
): {
	readonly command: string;
	readonly args: readonly string[];
} {
	if (platform === "darwin") {
		return { command: "open", args: [url] };
	}
	if (platform === "win32") {
		return { command: "cmd", args: ["/c", "start", "", url] };
	}
	return { command: "xdg-open", args: [url] };
}

/**
 * Starts the opener detached and forgets it. Never throws — and never
 * crashes later either: a command that does not exist reports through an
 * `error` EVENT, not a throw, and an `error` event without a listener is
 * an uncaught exception. In the CLI that killed a live tunnel, in the
 * plugin the dev server (invariant 4), on every Linux without xdg-utils.
 */
export function launchOpener(command: string, args: readonly string[]): void {
	try {
		const child = spawn(command, args, { detached: true, stdio: "ignore" });
		child.on("error", () => undefined);
		child.unref();
	} catch {
		// Best-effort: the URL is printed regardless.
	}
}

/** Best-effort cross-platform URL opener; never throws. */
export function openUrl(url: string): void {
	const { command, args } = openerFor(process.platform, url);
	launchOpener(command, args);
}
