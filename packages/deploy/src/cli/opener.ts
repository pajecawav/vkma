/**
 * Browser opener, CLI-only by design. The library layer physically cannot
 * spawn processes (see AGENTS.md invariant #2), so `vkma-deploy login`
 * injects this into `loginDeviceFlow({ openBrowser })` and only for
 * interactive (TTY) runs.
 */

import { spawn } from "node:child_process";

/**
 * Starts the opener detached and forgets it. Never throws — and never
 * crashes later either: `spawn` does not throw for a missing command, it
 * emits `error` on a later turn, and an `error` event without a listener
 * is an uncaught exception. Linux without xdg-utils has no `xdg-open`.
 */
export function launchOpener(command: string, args: readonly string[]): void {
	try {
		const child = spawn(command, args, { detached: true, stdio: "ignore" });
		child.on("error", () => undefined);
		child.unref();
	} catch {
		// Best-effort: the URL is printed regardless via onAuthUrl.
	}
}

/** Best-effort cross-platform URL opener; never throws. */
export function openUrl(url: string): void {
	const platform = process.platform;
	const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
	const args = platform === "win32" ? ["/c", "start", "", url] : [url];
	launchOpener(command, args);
}
