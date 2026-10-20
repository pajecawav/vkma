import { describe, expect, it } from "vitest";
import { DeployError } from "../errors.ts";
import { RETRY_JITTER_MS, retryDelayMs, runWithRetry } from "./retry.ts";

function boom(message = "boom"): Error {
	return new Error(message);
}

describe("runWithRetry", () => {
	it("returns the first success without retrying", async () => {
		let calls = 0;
		const result = await runWithRetry(
			async () => {
				calls += 1;
				return "ok";
			},
			{ shouldRetry: () => true },
		);
		expect(result).toBe("ok");
		expect(calls).toBe(1);
	});

	it("retries retriable errors until success", async () => {
		let calls = 0;
		const result = await runWithRetry(
			async () => {
				calls += 1;
				if (calls < 3) {
					throw boom();
				}
				return calls;
			},
			{
				shouldRetry: () => true,
				sleep: async () => {},
			},
		);
		expect(result).toBe(3);
	});

	it("does not retry when shouldRetry refuses", async () => {
		let calls = 0;
		await expect(
			runWithRetry(
				async () => {
					calls += 1;
					throw boom("fatal");
				},
				{ shouldRetry: () => false, sleep: async () => {} },
			),
		).rejects.toThrow("fatal");
		expect(calls).toBe(1);
	});

	it("never retries aborted errors, regardless of shouldRetry", async () => {
		let calls = 0;
		await expect(
			runWithRetry(
				async () => {
					calls += 1;
					throw new DeployError("aborted", "Operation aborted", { code: "E_ABORTED" });
				},
				{ shouldRetry: () => true, sleep: async () => {} },
			),
		).rejects.toSatisfy((error: unknown) => (error as DeployError).kind === "aborted");
		expect(calls).toBe(1);
	});

	it("throws the last error once the budget is exhausted", async () => {
		let calls = 0;
		await expect(
			runWithRetry(
				async () => {
					calls += 1;
					throw boom(`fail ${calls}`);
				},
				{ maxAttempts: 3, shouldRetry: () => true, sleep: async () => {} },
			),
		).rejects.toThrow("fail 3");
		expect(calls).toBe(3);
	});

	it("applies exponential backoff with jitter", async () => {
		const delays: number[] = [];
		let calls = 0;
		await runWithRetry(
			async () => {
				calls += 1;
				if (calls < 3) {
					throw boom();
				}
				return "ok";
			},
			{
				maxAttempts: 5,
				backoffBaseMs: 100,
				shouldRetry: () => true,
				sleep: async ms => {
					delays.push(ms);
				},
			},
		);
		expect(delays.length).toBe(2);
		expect(delays[0]).toBeGreaterThanOrEqual(100);
		expect(delays[0]).toBeLessThan(100 + RETRY_JITTER_MS);
		expect(delays[1]).toBeGreaterThanOrEqual(200);
		expect(delays[1]).toBeLessThan(200 + RETRY_JITTER_MS);
	});

	it("emits onRetry with attempt counters before each backoff", async () => {
		const events: { attempt: number; maxAttempts: number; error: string }[] = [];
		await expect(
			runWithRetry(
				async () => {
					throw boom("flaky");
				},
				{
					maxAttempts: 2,
					shouldRetry: () => true,
					sleep: async () => {},
					onRetry: info => events.push(info),
				},
			),
		).rejects.toThrow("flaky");
		expect(events).toEqual([{ attempt: 1, maxAttempts: 2, error: "flaky" }]);
	});

	it("finalizes the last error through finalizeError", async () => {
		await expect(
			runWithRetry(
				async () => {
					throw boom("raw");
				},
				{
					maxAttempts: 3,
					shouldRetry: () => true,
					sleep: async () => {},
					finalizeError: error =>
						new DeployError("network", `wrapped after 3: ${(error as Error).message}`, {
							code: "E_NETWORK",
						}),
				},
			),
		).rejects.toThrow("wrapped after 3: raw");
	});

	it("throws aborted when the signal fires between attempts", async () => {
		const controller = new AbortController();
		controller.abort();
		await expect(
			runWithRetry(async () => "unreachable", {
				signal: controller.signal,
				shouldRetry: () => true,
			}),
		).rejects.toSatisfy((error: unknown) => (error as DeployError).kind === "aborted");
	});
});

describe("retryDelayMs", () => {
	it("stays within [base·2^(n-1), base·2^(n-1)+jitter)", () => {
		for (let attempt = 1; attempt <= 4; attempt += 1) {
			const base = 100;
			const delay = retryDelayMs(attempt, base);
			expect(delay).toBeGreaterThanOrEqual(base * 2 ** (attempt - 1));
			expect(delay).toBeLessThan(base * 2 ** (attempt - 1) + RETRY_JITTER_MS);
		}
	});
});
