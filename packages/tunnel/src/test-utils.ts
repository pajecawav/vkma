/**
 * Test-only fake of `@opentunnel/client` (the promise wrapper).
 *
 * Deliberately NOT published (`files` in package.json). A test wires it in
 * with:
 *
 *     vi.mock("@opentunnel/client", async () => await import("../test-utils.ts"));
 *
 * It mirrors exactly the wrapper semantics the provider depends on — the
 * rest of the SDK is irrelevant here:
 *
 * - `ensure` provisions an identity through the injected store (first run)
 *   or loads the stored one;
 * - `connect` delivers lifecycle events through `onEvent` BEFORE it
 *   resolves, the way the SDK reports `route-conflict` while attaching;
 * - aborting `signal` makes the WRAPPER close the bridge itself, so the
 *   connection's `closed` RESOLVES on abort — it never rejects for that.
 *   `closed` rejects only on a fatal error (`fakeSdk.stop(error)`);
 * - `close` is idempotent and resolves `closed`.
 *
 * `fakeSdk` is the per-test-file control surface (one module registry per
 * test file): reset it in `beforeEach`.
 */

import fs from "node:fs/promises";
import path from "node:path";
import type { OpenTunnelIdentity, OpenTunnelStorage } from "@opentunnel/client";

export class OpenTunnelClientError extends Error {
	public readonly code?: string;

	public constructor(init: { message: string; code?: string; cause?: unknown }) {
		super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
		this.name = "OpenTunnelClientError";
		this.code = init.code;
	}
}

export function publicUrl(route: string, hostname: string): string {
	return route === "@" || route === "" ? `https://${hostname}` : `https://${route}.${hostname}`;
}

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

/** Settlers of the most recent live connection's `closed` (for `fakeSdk.stop`). */
let live:
	| {
			resolveClosed: () => void;
			rejectClosed: (error: unknown) => void;
			emit: (event: FakeEvent) => void;
	  }
	| undefined;

export interface FakeSdkStats {
	/** `connect` calls that reached an attach. */
	attaches: number;
	/** `close()` calls on any connection (idempotent repeats included). */
	closes: number;
	/** `client.dispose()` calls. */
	disposed: number;
}

/** What the provider last handed the SDK: proves its config section reached it. */
interface FakeSdkRequests {
	/** The API endpoint of the latest `create()`. */
	api: string | undefined;
	/** The routes of the latest `connect()`, before any retarget. */
	routes: Readonly<Record<string, string>>;
}

interface FakeSdk {
	hostname: string;
	/** Another bridge holds the route: every attach reports `route-conflict` first. */
	conflictOnAttach: boolean;
	/** `connect` rejects with a non-recoverable attach error (`bad_token`). */
	failConnect: boolean;
	/** The bridge refuses a retarget (`setRoutes` rejects). */
	failSetRoutes: boolean;
	/** How long the SDK takes to close a bridge; 0 = at once. */
	closeDelayMs: number;
	stats: FakeSdkStats;
	requests: FakeSdkRequests;
	/**
	 * The "server" ends the CURRENT connection: `closed` settles — cleanly
	 * (a server-side drain) or with a fatal error.
	 */
	stop(error?: unknown): void;
	/** The SDK reports an event on the current connection (visitor traffic, renewal…). */
	emit(event: FakeEvent): void;
	reset(): void;
}

export const fakeSdk: FakeSdk = {
	hostname: "4bznf5jcbkct.opentunnel.xyz",
	conflictOnAttach: false,
	failConnect: false,
	failSetRoutes: false,
	closeDelayMs: 0,
	stats: { attaches: 0, closes: 0, disposed: 0 },
	requests: { api: undefined, routes: {} },

	stop(error) {
		if (error === undefined) {
			live?.resolveClosed();
		} else {
			live?.rejectClosed(error);
		}
	},

	emit(event) {
		live?.emit(event);
	},

	reset(): void {
		this.hostname = "4bznf5jcbkct.opentunnel.xyz";
		this.conflictOnAttach = false;
		this.failConnect = false;
		this.failSetRoutes = false;
		this.closeDelayMs = 0;
		this.stats = { attaches: 0, closes: 0, disposed: 0 };
		this.requests = { api: undefined, routes: {} };
	},
};

/** One SDK lifecycle event; the provider only reads `type` and passes it through. */
type FakeEvent = Record<string, unknown> & { type: string };

export function create(options: { api?: string; store?: OpenTunnelStorage } = {}): {
	tunnel: {
		ensure: (input: { profile: string }) => Promise<OpenTunnelIdentity>;
		connect: (input: {
			profile: string;
			routes: Readonly<Record<string, string>>;
			signal?: AbortSignal;
			onEvent?: (event: FakeEvent) => void;
		}) => Promise<{
			tunnel: OpenTunnelIdentity;
			events: AsyncIterable<never>;
			status: () => {
				state: string;
				hostname: string;
				routes: Readonly<Record<string, string>>;
				connections: number;
			};
			urls: Readonly<Record<string, string>>;
			setRoutes: (routes: Readonly<Record<string, string>>) => Promise<void>;
			closed: Promise<void>;
			close: () => Promise<void>;
		}>;
	};
	dispose: () => Promise<void>;
} {
	const store = options.store;
	if (store === undefined) {
		throw new Error("fake @opentunnel/client: the provider must inject its record store");
	}
	fakeSdk.requests = { api: options.api, routes: {} };
	let identity: OpenTunnelIdentity | undefined;

	return {
		tunnel: {
			async ensure(input) {
				identity = await store.load(input.profile);
				if (identity !== undefined) {
					return identity;
				}
				identity = {
					id: "4bznf5jcbkct",
					hostname: fakeSdk.hostname,
					token: "token",
					privateKey: "key",
					certificate: "cert",
					chain: "chain",
					certificateExpiry: new Date(Date.now() + 30 * 24 * 3600 * 1000),
				};
				await store.save(input.profile, identity);
				return identity;
			},
			async connect(input) {
				fakeSdk.requests.routes = { ...input.routes };
				const signal = input.signal;
				signal?.throwIfAborted();
				let resolveClosed: () => void = () => undefined;
				let rejectClosed: (error: unknown) => void = () => undefined;
				const closed = new Promise<void>((resolve, reject) => {
					resolveClosed = resolve;
					rejectClosed = reject;
				});
				live = {
					resolveClosed,
					rejectClosed,
					emit: event => input.onEvent?.(event),
				};
				const state = { closed: false };
				const close = async (): Promise<void> => {
					fakeSdk.stats.closes += 1;
					if (state.closed) {
						return;
					}
					if (fakeSdk.closeDelayMs > 0) {
						await sleep(fakeSdk.closeDelayMs);
					}
					state.closed = true;
					resolveClosed();
				};
				if (signal?.aborted) {
					await close();
					throw signal.reason;
				}
				signal?.addEventListener("abort", () => void close(), { once: true });

				const current = identity as OpenTunnelIdentity;
				let routes: Readonly<Record<string, string>> = { ...input.routes };
				const emit = (event: FakeEvent): void => {
					input.onEvent?.(event);
				};
				emit({ type: "connecting", attempt: 0 });
				if (fakeSdk.failConnect) {
					throw new OpenTunnelClientError({
						message: "Failed to connect tunnel: Bridge attach failed: bad_token",
						code: "bad_token",
					});
				}
				if (fakeSdk.conflictOnAttach) {
					emit({ type: "route-conflict", routes: Object.keys(routes).toSorted() });
					emit({ type: "disconnected", reason: "attach failed: route_conflict" });
					emit({ type: "reconnecting", attempt: 1, delayMs: 177 });
					emit({ type: "connecting", attempt: 1 });
				}
				fakeSdk.stats.attaches += 1;
				emit({
					type: "connected",
					session: `session-${String(fakeSdk.stats.attaches)}`,
					routes: Object.keys(routes).toSorted(),
				});

				return {
					tunnel: current,
					events: (async function* () {})(),
					status: () => ({
						state: state.closed ? "stopped" : "connected",
						hostname: current.hostname,
						routes,
						connections: 0,
					}),
					get urls() {
						return Object.fromEntries(
							Object.keys(routes).map(route => [
								route,
								publicUrl(route, current.hostname),
							]),
						);
					},
					setRoutes: async next => {
						if (fakeSdk.failSetRoutes) {
							throw new OpenTunnelClientError({
								message: "bridge is reconnecting",
								code: "E_RECONNECTING",
							});
						}
						routes = { ...next };
					},
					closed,
					close,
				};
			},
		},
		dispose: async () => {
			fakeSdk.stats.disposed += 1;
		},
	};
}

/**
 * Installs the fake `cloudflared` (cloudflared.fake.mjs) under `root` and
 * returns what a test needs to run the real provider against it: the
 * environment for the provider and the directory the fake writes to.
 */
export async function installFakeCloudflared(
	root: string,
	env: Record<string, string> = {},
): Promise<{ env: Record<string, string | undefined>; stateDir: string }> {
	const binDir = path.join(root, "fake-bin");
	const stateDir = path.join(root, "fake-state");
	await fs.mkdir(binDir, { recursive: true });
	await fs.rm(stateDir, { recursive: true, force: true });
	await fs.mkdir(stateDir, { recursive: true });
	const binary = path.join(binDir, "cloudflared");
	await fs.copyFile(path.join(import.meta.dirname, "providers", "cloudflared.fake.mjs"), binary);
	await fs.chmod(binary, 0o755);
	return {
		env: {
			...process.env,
			PATH: `${binDir}${path.delimiter}${process.env["PATH"] ?? ""}`,
			FAKE_CF_STATE: stateDir,
			...env,
		},
		stateDir,
	};
}

/** How many times the fake cloudflared was launched. */
export async function fakeCloudflaredLaunches(stateDir: string): Promise<number> {
	return Number(await fs.readFile(path.join(stateDir, "launches"), "utf8").catch(() => "0"));
}
