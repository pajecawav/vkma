import { describe, expect, it } from "vitest";
import type { ProfileRecord } from "../core/identity.ts";
import { isPidAlive, rivalHint } from "./conflict-hint.ts";

/** A pid no kernel hands out: far above every `pid_max` in practice. */
const DEAD_PID = 2147483647;

const record = (pid: number, startedAt?: string): ProfileRecord => ({
	profile: "app",
	hostname: "app.opentunnel.xyz",
	pid,
	startedAt,
});

describe("isPidAlive", () => {
	it("sees a live process and misses a dead one", () => {
		expect(isPidAlive(process.pid)).toBe(true);
		// The test runner's parent: alive for the whole run on every platform.
		expect(isPidAlive(process.ppid)).toBe(true);
		expect(isPidAlive(DEAD_PID)).toBe(false);
	});
});

describe("rivalHint", () => {
	it("stays silent without a record, without a pid, or for our own pid", () => {
		expect(rivalHint(undefined, process.pid)).toBeUndefined();
		expect(
			rivalHint({ profile: "app", hostname: "app.opentunnel.xyz" }, process.pid),
		).toBeUndefined();
		expect(rivalHint(record(process.pid), process.pid)).toBeUndefined();
	});

	it("names a live rival and how to get rid of it", () => {
		const hint = rivalHint(record(process.ppid, "2026-11-23T10:00:00.000Z"), process.pid);
		expect(hint).toBe(
			`tunnel: profile "app" is also used by process ${String(process.ppid)} (started 2026-11-23T10:00:00.000Z) — stop it (kill ${String(process.ppid)}), or give this run its own profile`,
		);
	});

	it("explains a dead holder: the service still owns the route", () => {
		const hint = rivalHint(record(DEAD_PID), process.pid);
		expect(hint).toBe(
			`tunnel: profile "app" was last used by process ${String(DEAD_PID)}, which is no longer running — the service still holds its route; the tunnel takes it over once the service releases it`,
		);
	});
});
