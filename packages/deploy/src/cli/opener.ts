/**
 * Browser opener — CLI-only by design. The library layer physically cannot
 * spawn processes (see AGENTS.md invariant #2), so `vkma-deploy login`
 * injects this into `loginDeviceFlow({ openBrowser })` and only for
 * interactive (TTY) runs.
 */

import { spawn } from "node:child_process";

/** Best-effort cross-platform URL opener; never throws. */
export function openUrl(url: string): void {
	const platform = process.platform;
	const command = platform === "darwin" ? "open" : platform === "win32" ? "cmd" : "xdg-open";
	const args = platform === "win32" ? ["/c", "start", "", url] : [url];
	try {
		const child = spawn(command, args, { detached: true, stdio: "ignore" });
		child.unref();
	} catch {
		// Best-effort: the URL is printed regardless via onAuthUrl.
	}
}
