#!/usr/bin/env node

/**
 * Binary entry: wires SIGINT to an AbortSignal and turns `main()`'s exit
 * code into `process.exitCode`. Everything testable lives in `cli/main.ts`.
 *
 * `process.exitCode` (not `process.exit`) so pending piped-stdout writes
 * drain before the process ends — `--json | jq` must never lose tail
 * records. The event loop exits on its own once main() resolves.
 */

import { main } from "./cli/main.ts";

const controller = new AbortController();
let interrupted = 0;

process.on("SIGINT", () => {
	interrupted += 1;
	if (interrupted > 1) {
		// Second Ctrl+C: exit immediately.
		process.exit(130);
	}
	controller.abort();
});

const code = await main(process.argv.slice(2), { signal: controller.signal });
process.exitCode = code;
