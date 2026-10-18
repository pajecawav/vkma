#!/usr/bin/env node

/**
 * Binary entry: wires SIGINT to an AbortSignal and turns `main()`'s exit
 * code into `process.exit`. Everything testable lives in `cli/main.ts`.
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
process.exit(code);
