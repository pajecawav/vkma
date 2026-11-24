import { afterEach, describe, expect, it, vi } from "vitest";
import { launchOpener } from "./opener.ts";

describe("launchOpener", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("never reports a missing opener as an uncaught exception", async () => {
		// `spawn` does not throw for ENOENT: it emits `error` on the next
		// turn. Without a listener that event is fatal to the process.
		const uncaught = vi.fn();
		process.on("uncaughtException", uncaught);
		try {
			launchOpener("definitely-not-installed-opener", ["https://example.com"]);
			// The event arrives a tick later; give it every chance to fire.
			await new Promise(resolve => setTimeout(resolve, 50));
			expect(uncaught).not.toHaveBeenCalled();
		} finally {
			process.off("uncaughtException", uncaught);
		}
	});
});
