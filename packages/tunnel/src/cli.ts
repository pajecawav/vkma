#!/usr/bin/env node

/**
 * Binary entry: wires SIGINT/SIGTERM to an AbortSignal and turns `main()`'s
 * exit code into `process.exitCode`. Everything testable lives in `cli/main.ts`.
 *
 * `process.exitCode` (not `process.exit`) so pending piped-stdout writes
 * drain before the process ends. The unref'd force-exit timer is the last
 * resort: the opentunnel SDK can keep event-loop handles alive after a
 * clean stop, and a wedged tunnel must never hold the terminal hostage.
 */

import { SHOW_CURSOR } from "./cli/logger.ts";
import { main } from "./cli/main.ts";

const controller = new AbortController();
let interrupted = 0;

function onSignal(): void {
	interrupted += 1;
	if (interrupted > 1) {
		// Second Ctrl+C: exit immediately, but never leave the terminal
		// cursor-less (the spinner hides it and normal disposal never
		// runs). The bridge dies with the process; the identity stays
		// stored for the next run.
		process.stdout.write(SHOW_CURSOR);
		process.exit(130);
	}
	controller.abort();
}

process.on("SIGINT", onSignal);
// SIGTERM (timeout, docker stop, systemd) and SIGHUP (the terminal
// closes) get the same graceful path as Ctrl+C: a hard kill skips the
// bridge close and the server keeps the route bound to a ghost session —
// exactly the route_conflict storm the next run then has to take over.
process.on("SIGTERM", onSignal);
process.on("SIGHUP", onSignal);

// Swallow EPIPE on stdout/stderr (`vkma-tunnel list | head`).
for (const stream of [process.stdout, process.stderr]) {
	stream.on("error", (error: NodeJS.ErrnoException) => {
		if (error.code !== "EPIPE") {
			throw error;
		}
	});
}

try {
	const code = await main(process.argv.slice(2), { signal: controller.signal });
	process.exitCode = code;
	// Fires only if SDK handles still keep the loop alive ~2s after a
	// decided exit; unref'd so it never holds the process open itself.
	const forceExit = setTimeout(() => process.exit(code), 2000);
	forceExit.unref?.();
} catch (error) {
	// main() is expected to handle its own errors; this is a last-resort
	// net so a bug never becomes an unhandled rejection.
	process.stderr.write(`vkma-tunnel: unexpected failure: ${String(error)}\n`);
	process.exitCode = 1;
}
