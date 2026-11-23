import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TunnelEvent } from "../core/types.ts";
import { OpenTunnelClientError, fakeSdk } from "../test-utils.ts";
import { opentunnelProvider } from "./opentunnel.ts";

// The provider talks to the SDK; the fake mirrors the promise wrapper's contract.
vi.mock("@opentunnel/client", async () => await import("../test-utils.ts"));

let dataDir: string;

beforeAll(async () => {
	dataDir = await fs.mkdtemp(path.join(import.meta.dirname, ".supervision-test-data-"));
});

afterAll(async () => {
	await fs.rm(dataDir, { recursive: true, force: true });
});

beforeEach(() => {
	fakeSdk.reset();
});

const connect = (
	signal?: AbortSignal,
	onEvent?: (event: TunnelEvent) => void,
): ReturnType<typeof opentunnelProvider.connect> =>
	opentunnelProvider.connect({
		profile: "supervised",
		route: "@",
		host: "127.0.0.1",
		port: 5173,
		dataDir,
		signal,
		onEvent,
		keepAlive: false,
	});

/** Fails the test instead of hanging when a promise never settles. */
function within<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			setTimeout(
				() => reject(new Error(`${what} did not settle within ${String(ms)}ms`)),
				ms,
			);
		}),
	]);
}

describe("opentunnel provider — `closed`", () => {
	it("settles as soon as the SDK closes the bridge on abort", async () => {
		const controller = new AbortController();
		fakeSdk.closeDelayMs = 20;
		const events: string[] = [];
		const connection = await connect(controller.signal, event => {
			events.push(event.type);
		});

		controller.abort();

		// The wrapper closes the bridge itself; the provider must not sit
		// back and wait for a `close()` that a Ctrl+C never sends.
		await within(connection.closed, 500, "closed");
		expect(connection.status().state).toBe("stopped");
		expect(events.filter(type => type === "stopped")).toHaveLength(1);
		expect(fakeSdk.stats.closes).toBe(1);
	});

	it("rejects on a fatal error, carrying the SDK's code", async () => {
		const connection = await connect();

		fakeSdk.stop(
			new OpenTunnelClientError({
				message: "Tunnel stopped: Bridge attach failed: bad_token",
				code: "bad_token",
			}),
		);

		await expect(connection.closed).rejects.toMatchObject({
			kind: "network",
			code: "bad_token",
		});
	});

	it("resolves `closed` through close(), idempotently, with ONE stopped event", async () => {
		const events: string[] = [];
		const connection = await connect(undefined, event => {
			events.push(event.type);
		});

		await connection.close();
		await connection.close();

		await within(connection.closed, 500, "closed");
		expect(events.filter(type => type === "stopped")).toHaveLength(1);
	});

	it("closing after an abort is a no-op", async () => {
		const controller = new AbortController();
		const connection = await connect(controller.signal);

		controller.abort();
		await within(connection.closed, 500, "closed");
		await connection.close();

		expect(connection.status().state).toBe("stopped");
	});
});
