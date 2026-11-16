/**
 * Browser opener, CLI-only by design (same policy as @vkma.dev/deploy).
 * The library layer never spawns processes.
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
		// Best-effort: the URL is printed regardless.
	}
}
