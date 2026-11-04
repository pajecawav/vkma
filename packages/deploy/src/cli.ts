#!/usr/bin/env node

/**
 * Binary entry: wires SIGINT to an AbortSignal and turns `main()`'s exit
 * code into `process.exitCode`. Everything testable lives in `cli/main.ts`.
 *
 * `process.exitCode` (not `process.exit`) so pending piped-stdout writes
 * drain before the process ends. `--json | jq` must never lose tail
 * records. The event loop exits on its own once main() resolves.
 */

import { main } from "./cli/main.ts";
import { closeAllPrompts } from "./cli/prompt.ts";
import { SHOW_CURSOR } from "./logger/index.ts";

const controller = new AbortController();
let interrupted = 0;

process.on("SIGINT", () => {
	interrupted += 1;
	if (interrupted > 1) {
		// Second Ctrl+C: exit immediately, but never leave the terminal
		// cursor-less (the spinner hides it and normal disposal never runs).
		process.stdout.write(SHOW_CURSOR);
		process.exit(130);
	}
	controller.abort();
});

// Swallow EPIPE on stdout/stderr (`--json | jq | head`): with the error
// event handled, later writes fail silently and the process still exits
// normally with the real exit code once main() drains, instead of dying
// with an unhandled-rejection stack dump.
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
} catch (error) {
	// main() is expected to handle its own errors; this is a last-resort
	// net so a bug never becomes an unhandled rejection.
	process.stderr.write(`vkma-deploy: unexpected failure: ${String(error)}\n`);
	process.exitCode = 1;
} finally {
	// Shared readline interfaces hold stdin; without this the process
	// would not exit after an interactive run.
	closeAllPrompts();
}
