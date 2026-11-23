import fs from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TunnelEvent } from "../core/types.ts";
import { OpenTunnelClientError, fakeSdk } from "../test-utils.ts";
import { PRE_STREAM_EVENT_TAIL } from "./event-stream.ts";
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
		opentunnel: { route: "@" },
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

describe("opentunnel provider — `events`", () => {
	/** Drains the stream to its end; fails instead of hanging if it never ends. */
	const drain = (events: AsyncIterable<TunnelEvent>): Promise<TunnelEvent[]> =>
		within(
			(async () => {
				const seen: TunnelEvent[] = [];
				for await (const event of events) {
					seen.push(event);
				}
				return seen;
			})(),
			500,
			"events stream",
		);

	it("ends after the stopped event of a close()", async () => {
		const connection = await connect();
		const draining = drain(connection.events);

		await connection.close();

		expect((await draining).map(event => event.type)).toEqual([
			"connecting",
			"connected",
			"stopped",
		]);
	});

	it("ends on abort", async () => {
		const controller = new AbortController();
		const connection = await connect(controller.signal);
		const draining = drain(connection.events);

		controller.abort();
		await within(connection.closed, 500, "closed");

		const seen = await draining;
		expect(seen.at(-1)?.type).toBe("stopped");
	});

	it("ends on a fatal too — no terminal event, `closed` carries the error", async () => {
		const connection = await connect();
		const draining = drain(connection.events);

		fakeSdk.stop(
			new OpenTunnelClientError({ message: "Tunnel stopped: bad_token", code: "bad_token" }),
		);

		await expect(connection.closed).rejects.toMatchObject({ kind: "network" });
		expect((await draining).map(event => event.type)).toEqual(["connecting", "connected"]);
	});

	it("streams live events to an iterating consumer", async () => {
		const connection = await connect();
		const seen: TunnelEvent[] = [];
		const draining = (async () => {
			for await (const event of connection.events) {
				seen.push(event);
			}
		})();
		// Let the consumer pick up the buffered events and park.
		await new Promise(resolve => setTimeout(resolve, 10));

		fakeSdk.emit({ type: "certificate-renewed", expiry: "2027-01-01T00:00:00.000Z" });
		await connection.close();
		await within(draining, 500, "events stream");

		expect(seen.map(event => event.type)).toEqual([
			"connecting",
			"connected",
			"certificate-renewed",
			"stopped",
		]);
	});

	it("keeps only a bounded tail while nobody iterates", async () => {
		// The CLI and the plugin never touch `events`: visitor traffic must
		// not grow the queue for the lifetime of the process.
		const connection = await connect();
		for (let conn = 0; conn < 1000; conn++) {
			fakeSdk.emit({ type: "connection-opened", conn, route: "@", peer: "203.0.113.7" });
		}

		// The tunnel is still live, so read what is buffered and stop:
		// "nothing more within 50 ms" means the buffer is drained.
		const iterator = connection.events[Symbol.asyncIterator]();
		const seen: TunnelEvent[] = [];
		try {
			for (let guard = 0; guard < 1200; guard++) {
				const next = await Promise.race([
					iterator.next().then(result => (result.done ? undefined : result.value)),
					new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 50)),
				]);
				if (next === undefined) {
					break;
				}
				seen.push(next);
			}
		} finally {
			// Closing ends the stream, which also settles the `next()` left
			// pending by the race above (an async generator parked in an
			// `await` only takes `return()` once it reaches a yield).
			await connection.close();
			await iterator.return?.();
		}

		expect(seen).toHaveLength(PRE_STREAM_EVENT_TAIL);
		expect(seen.every(event => event.type === "connection-opened")).toBe(true);
	});
});
