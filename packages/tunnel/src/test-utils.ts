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
 *   `closed` rejects only on a fatal error;
 * - `close` is idempotent and resolves `closed`.
 *
 * `fakeSdk` is the per-test-file control surface (one module registry per
 * test file): reset it in `beforeEach`.
 */

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

export interface FakeSdkStats {
	/** `connect` calls that reached an attach. */
	attaches: number;
	/** `close()` calls on any connection (idempotent repeats included). */
	closes: number;
	/** `client.dispose()` calls. */
	disposed: number;
}

interface FakeSdk {
	hostname: string;
	/** Another bridge holds the route: every attach reports `route-conflict` first. */
	conflictOnAttach: boolean;
	/** `connect` rejects with a non-recoverable attach error (`bad_token`). */
	failConnect: boolean;
	/** How long the SDK takes to close a bridge; 0 = at once. */
	closeDelayMs: number;
	stats: FakeSdkStats;
	reset(): void;
}

export const fakeSdk: FakeSdk = {
	hostname: "4bznf5jcbkct.opentunnel.xyz",
	conflictOnAttach: false,
	failConnect: false,
	closeDelayMs: 0,
	stats: { attaches: 0, closes: 0, disposed: 0 },

	reset(): void {
		this.hostname = "4bznf5jcbkct.opentunnel.xyz";
		this.conflictOnAttach = false;
		this.failConnect = false;
		this.closeDelayMs = 0;
		this.stats = { attaches: 0, closes: 0, disposed: 0 };
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
				const signal = input.signal;
				signal?.throwIfAborted();
				let resolveClosed: () => void = () => undefined;
				const closed = new Promise<void>(resolve => {
					resolveClosed = resolve;
				});
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
