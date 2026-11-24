/**
 * Internal to the Vite plugin — NOT part of the `/vite` entry. The exit
 * guard and the bounded close the plugin's shutdown path is built on live
 * here so tests can drive the guard with an injected `exit` without any
 * of it turning into public API.
 */

import os from "node:os";

/**
 * The plugin's own cap on the graceful tunnel close while Vite is shutting
 * down — a floor. A handle may declare a longer `closeTimeoutMs` (the
 * bound of its provider's teardown), and `stop()` waits that long instead.
 */
export const EXIT_CLOSE_CAP_MS = 1500;

/** Signals that end a Vite process without running a single plugin hook. */
const EXIT_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGHUP"];

export interface ExitGuardOptions {
	readonly signals?: readonly NodeJS.Signals[];
	/** Replaces `process.exit` (tests). */
	readonly exit?: (code: number) => void;
}

/**
 * Owns the exit signals Vite never handles, for as long as a tunnel is
 * live: close the bridge first, then leave the way the signal would
 * have (128 + signal number). Listeners are additive in Node — nothing
 * is overridden — but the default "die on SIGINT" only applies while no
 * listener exists, which is why the handler must exit by itself. A
 * second signal finds no listener left and kills at once.
 *
 * A signal somebody else already listens on is left alone: that owner
 * (an embedded Vite, a supervisor) shuts the process down itself and
 * reaches the plugin's hooks through `server.close()`.
 *
 * Returns the disposer.
 */
export function installExitGuard(
	close: () => Promise<void>,
	options: ExitGuardOptions = {},
): () => void {
	const exit = options.exit ?? ((code: number): void => void process.exit(code));
	const installed: Array<{ signal: NodeJS.Signals; handler: () => void }> = [];
	for (const signal of options.signals ?? EXIT_SIGNALS) {
		if (process.listenerCount(signal) > 0) {
			continue;
		}
		const handler = (): void => {
			// No logging: on SIGHUP the terminal is already gone.
			void close()
				.catch(() => undefined)
				.then(() => exit(128 + os.constants.signals[signal]));
		};
		process.once(signal, handler);
		installed.push({ signal, handler });
	}
	return () => {
		for (const { signal, handler } of installed) {
			process.off(signal, handler);
		}
	};
}

/** Resolves with `promise`, or when `ms` passes — whichever comes first. */
export function cap(promise: Promise<unknown>, ms: number): Promise<void> {
	return new Promise(resolve => {
		const timer = setTimeout(resolve, ms);
		timer.unref?.();
		void promise
			.catch(() => undefined)
			.then(() => {
				clearTimeout(timer);
				resolve(undefined);
			});
	});
}
