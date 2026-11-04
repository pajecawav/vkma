/**
 * The single retry policy for every transport call.
 *
 * One operation = one attempt budget: `runWithRetry` owns the loop, the
 * exponential backoff with jitter, and the abort checks. Callers decide
 * *what* is retriable via `shouldRetry`. Layered retry loops (one inside
 * the transport, one around the API call) multiplied request counts and
 * are gone for good.
 */

import { DeployError } from "../errors.ts";

/** Upper bound of the random jitter added to every backoff delay. */
export const RETRY_JITTER_MS = 250;

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 500;

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export interface RetryOptions {
	/** Total attempt budget for the whole operation. Default: 3. */
	readonly maxAttempts?: number;
	/** Backoff base in ms; delay = base * 2^(attempt-1) + jitter(0..250). */
	readonly backoffBaseMs?: number;
	/** Injectable sleep for tests; defaults to a real timer. */
	readonly sleep?: (ms: number) => Promise<void>;
	readonly signal?: AbortSignal;
	/** Emitted before each backoff with attempt counters and the error. */
	readonly onRetry?: (info: { attempt: number; maxAttempts: number; error: string }) => void;
	/** Decides whether a thrown error is worth another attempt. */
	readonly shouldRetry?: (error: unknown) => boolean;
	/** Rewrites the last error after the budget is exhausted. */
	readonly finalizeError?: (error: unknown, maxAttempts: number) => unknown;
}

/** Exponential backoff with jitter: `base * 2^(attempt-1) + jitter(0..250)`. */
export function retryDelayMs(attempt: number, baseMs: number): number {
	return baseMs * 2 ** (attempt - 1) + Math.floor(Math.random() * RETRY_JITTER_MS);
}

export async function runWithRetry<T>(
	fn: () => Promise<T>,
	options: RetryOptions = {},
): Promise<T> {
	const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
	const baseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
	const sleep = options.sleep ?? defaultSleep;

	for (let attempt = 1; ; attempt++) {
		if (options.signal?.aborted) {
			throw new DeployError("aborted", "Operation aborted", { code: "E_ABORTED" });
		}
		try {
			return await fn();
		} catch (error) {
			// Aborts are never retried and never rewritten.
			if (
				error instanceof DeployError &&
				error.kind === "aborted" &&
				!options.signal?.aborted
			) {
				throw error;
			}
			if (options.signal?.aborted) {
				throw new DeployError("aborted", "Operation aborted", { code: "E_ABORTED" });
			}
			const retriable = options.shouldRetry?.(error) ?? false;
			if (!retriable || attempt >= maxAttempts) {
				throw options.finalizeError ? options.finalizeError(error, maxAttempts) : error;
			}
			options.onRetry?.({
				attempt,
				maxAttempts,
				error: error instanceof Error ? error.message : String(error),
			});
			await sleep(retryDelayMs(attempt, baseMs));
		}
	}
}
