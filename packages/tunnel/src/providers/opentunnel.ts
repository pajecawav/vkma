/**
 * The opentunnel provider (https://opentunnel.xyz).
 *
 * Blind TLS tunnels: the server reads only the TLS ClientHello, the key
 * never leaves the machine, HTTPS is automatic — exactly what VK Mini
 * Apps need on a phone.
 *
 * Identity persistence does NOT use the SDK's XDG store: we back the
 * client with our own `OpenTunnelStorage` adapter over
 * `$XDG_DATA_HOME/vkma/tunnel/<profile>.json` so the record format is
 * ours (shared `hostname`/`lastTarget` metadata beside the identity) and
 * never drifts with the SDK's store layout.
 */

import fs from "node:fs/promises";
import {
	create,
	OpenTunnelClientError,
	publicUrl,
	type OpenTunnelClientEvent,
	type OpenTunnelIdentity,
	type OpenTunnelPendingIdentity,
	type OpenTunnelStatus,
	type OpenTunnelStorage,
} from "@opentunnel/client";
import {
	listProfileRecords,
	mergeRecordFile,
	profileFilePath,
	removeProfileRecord,
} from "../core/identity.ts";
import type {
	TunnelEvent,
	TunnelProvider,
	TunnelProviderConnectOptions,
	TunnelProviderConnection,
} from "../core/types.ts";
import { TunnelError } from "../errors.ts";

/** The identity fields stored verbatim in the record file. */
const IDENTITY_KEYS = [
	"id",
	"hostname",
	"token",
	"privateKey",
	"certificate",
	"chain",
	"certificateExpiry",
] as const;

export const opentunnelProvider: TunnelProvider = {
	id: "opentunnel",
	connect(options: TunnelProviderConnectOptions): Promise<TunnelProviderConnection> {
		return connectOpenTunnel(options);
	},
};

async function connectOpenTunnel(
	options: TunnelProviderConnectOptions,
): Promise<TunnelProviderConnection> {
	const target = `${options.host}:${options.port}`;

	const client = create({
		api: options.api,
		store: createRecordStorage(options.dataDir),
	});

	// Provision (or resume) the identity before attaching: `ensure` is the
	// only step surface with progress stages, and first-time certificate
	// issuance regularly takes a minute+ — callers need to see why.
	// `ensure` takes no AbortSignal (SDK gap), so we race it ourselves:
	// without this, Ctrl+C during first provisioning holds the process
	// until the certificate loop eventually ends on its own.
	try {
		await raceAbort(
			client.tunnel.ensure({
				profile: options.profile,
				onProgress: stage => options.onProgress?.(stage),
			}),
			options.signal,
		);
	} catch (error) {
		await bounded(client.dispose());
		if (options.signal?.aborted === true) {
			throw new TunnelError("aborted", "Tunnel connect aborted", {
				cause: error,
				code: "E_ABORTED",
			});
		}
		throw mapClientError(error);
	}

	type SdkConnection = Awaited<ReturnType<typeof client.tunnel.connect>>;

	// -- supervised connection ---------------------------------------------
	//
	// The service's per-connection relay can wedge while the bridge
	// WebSocket stays "connected": visitor connections open (the `open`
	// control arrives) but no byte ever comes back, and the SDK — seeing a
	// healthy bridge — sits like that forever. The supervisor wraps the
	// SDK connection with a health watchdog: probes through the public URL
	// and, when the relay is wedged (soft timeouts with a reachable local
	// target), gracefully closes the bridge and attaches a fresh one. The
	// identity — and with it the public URL — never changes.

	let current: SdkConnection;
	let tornDown = false;
	let restarting = false;
	let watchdogTimer: ReturnType<typeof setInterval> | undefined;
	let timeoutStreak = 0;
	let restarts = 0;

	// Merged event stream: every SDK connection (initial + restarts) feeds
	// one AsyncIterable + the caller's onEvent.
	const eventQueue: TunnelEvent[] = [];
	let eventNotify: (() => void) | undefined;
	const sink = (event: TunnelEvent): void => {
		eventQueue.push(event);
		options.onEvent?.(event);
		eventNotify?.();
	};

	let settleResolve: () => void = () => undefined;
	let settleReject: (error: unknown) => void = () => undefined;
	const settleClosed = new Promise<void>((resolve, reject) => {
		settleResolve = resolve;
		settleReject = reject;
	});

	const fatal = (error: unknown): void => {
		if (tornDown) {
			return;
		}
		tornDown = true;
		stopWatchdog();
		void bounded(current.close());
		void bounded(client.dispose());
		settleReject(error);
	};

	// Forward target — mutable: the core may retarget the live bridge to
	// its host-rewriting proxy right after the first attach; watchdog
	// restarts must then attach to the swapped target too.
	let forwardTarget = target;

	const attach = async (): Promise<SdkConnection> => {
		const connection = await client.tunnel.connect({
			profile: options.profile,
			routes: { [options.route]: forwardTarget },
			signal: options.signal,
			onEvent: event => {
				const mapped = mapEvent(event);
				// `stopped` from the SDK belongs to the supervisor: a
				// watchdog restart closes the old bridge (its clean
				// `stopped` must not leak as a scary mid-run line), and
				// fatals surface through `closed` instead.
				if (mapped.type === "stopped") {
					return;
				}
				sink(mapped);
			},
		});
		// Resolution is our own (graceful teardown or watchdog restart);
		// rejection is a fatal the supervisor surfaces as `closed`.
		void connection.closed.catch((error: unknown) => {
			if (!restarting && !tornDown) {
				fatal(error);
			}
		});
		return connection;
	};

	const setRoutes = async (routes: Readonly<Record<string, string>>): Promise<void> => {
		const ownRoute = routes[options.route];
		if (typeof ownRoute === "string") {
			forwardTarget = ownRoute;
		}
		await current.setRoutes(routes);
	};

	const restart = async (): Promise<void> => {
		restarts += 1;
		restarting = true;
		timeoutStreak = 0;
		sink({
			type: "disconnected",
			reason: "health watchdog: bridge unresponsive, restarting bridge",
		});
		await bounded(current.close());
		current = await attach();
		restarting = false;
		sink({
			type: "connected",
			session: `watchdog-restart-${String(restarts)}`,
			routes: [options.route],
		});
	};

	const stopWatchdog = (): void => {
		if (watchdogTimer !== undefined) {
			clearInterval(watchdogTimer);
			watchdogTimer = undefined;
		}
	};

	/** One health check: direct target probe first, then through the public URL. */
	const healthCheck = async (): Promise<void> => {
		if (mapStatus(current.status()).state !== "connected") {
			// The SDK is reconnecting on its own; probes here prove nothing.
			timeoutStreak = 0;
			return;
		}

		// Baseline: the target answering DIRECTLY (plain http://localhost —
		// vite always allows localhost). A target that fails directly is
		// the problem itself; restarting bridges would fix nothing.
		const direct = await probeHttp(`http://${options.host}:${String(options.port)}`);
		if (!direct) {
			timeoutStreak = 0;
			return;
		}

		// The tunneled probe: soft timeout (nothing at all) or a mid-handshake
		// reset — BOTH mean a wedged relay. This service resets TLS handshakes
		// within a second when its relay dies, so "fast error" is NOT proof of
		// health; the direct probe above is what proves the target is fine.
		const tunneled = await probeHttp(
			publicUrl(options.route, current.tunnel.hostname),
			PROBE_TIMEOUT_MS,
		);
		if (!tunneled) {
			timeoutStreak += 1;
			return;
		}
		timeoutStreak = 0;
	};

	const startWatchdog = (): void => {
		if (options.keepAlive === false || watchdogTimer !== undefined) {
			return;
		}
		watchdogTimer = setInterval(() => {
			const check = async (): Promise<void> => {
				await healthCheck();
				if (timeoutStreak >= PROBE_FAILURE_LIMIT && !restarting && !tornDown) {
					try {
						await restart();
					} catch (error) {
						fatal(error);
					}
				}
			};
			void check();
		}, PROBE_INTERVAL_MS);
		watchdogTimer.unref?.();
	};

	try {
		current = await attach();
	} catch (error) {
		await bounded(client.dispose());
		// Aborting mid-attach rejects with the signal's reason: report the
		// abort, not a phantom network failure.
		if (options.signal?.aborted === true) {
			throw new TunnelError("aborted", "Tunnel connect aborted", {
				cause: error,
				code: "E_ABORTED",
			});
		}
		throw mapClientError(error);
	}

	startWatchdog();

	const teardown = async (): Promise<void> => {
		if (tornDown) {
			return;
		}
		tornDown = true;
		stopWatchdog();
		await bounded(current.close());
		await bounded(client.dispose());
		// The supervisor owns the `stopped` semantics (SDK copies are
		// filtered in attach): one clean stop when the user asks for it.
		sink({ type: "stopped" });
		settleResolve();
	};

	async function* mergedEvents(): AsyncGenerator<TunnelEvent> {
		for (;;) {
			while (eventQueue.length > 0) {
				yield eventQueue.shift() as TunnelEvent;
			}
			await new Promise<void>(resolve => {
				eventNotify = resolve;
			});
		}
	}

	return {
		hostname: current.tunnel.hostname,
		get urls() {
			return current.urls;
		},
		events: mergedEvents(),
		status: () => mapStatus(current.status()),
		setRoutes,
		close: teardown,
		closed: settleClosed,
	};
}

/** Soft timeout before a probe counts as "no answer at all". */
const PROBE_TIMEOUT_MS = 10_000;
/** Direct-target probe deadline (the watchdog baseline). */
const DIRECT_PROBE_TIMEOUT_MS = 5_000;
/** Consecutive wedged probes before the watchdog restarts the bridge. */
const PROBE_FAILURE_LIMIT = 2;
/** Health-probe / keepalive cadence. */
const PROBE_INTERVAL_MS = 20_000;

/**
 * HEAD probe with a deadline: any HTTP response counts as alive
 * (4xx/5xx included — presence of a reply is the signal, not the code).
 */
async function probeHttp(url: string, timeoutMs = DIRECT_PROBE_TIMEOUT_MS): Promise<boolean> {
	try {
		const response = await fetch(url, {
			method: "HEAD",
			signal: AbortSignal.timeout(timeoutMs),
			redirect: "manual",
		});
		response.body?.cancel().catch(() => undefined);
		return true;
	} catch {
		return false;
	}
}

/** Swallows rejections AND never waits longer than `ms` (SDK teardown can hang on a dead bridge). */
function bounded(promise: Promise<unknown>, ms = 2500): Promise<void> {
	return new Promise<void>(resolve => {
		const timer = setTimeout(() => resolve(undefined), ms);
		timer.unref?.();
		promise.then(
			() => {
				clearTimeout(timer);
				resolve(undefined);
			},
			() => {
				clearTimeout(timer);
				resolve(undefined);
			},
		);
	});
}

/**
 * Races an un-cancellable SDK call against an AbortSignal: resolves with
 * the call's outcome, or rejects as soon as the signal fires (the
 * underlying call keeps running in the SDK runtime; the CLI's force-exit
 * timer reaps whatever it leaves behind).
 */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined): Promise<T> {
	if (signal === undefined) {
		return promise;
	}
	return new Promise<T>((resolve, reject) => {
		let done = false;
		const settle = (fn: () => void): void => {
			if (done) {
				return;
			}
			done = true;
			signal.removeEventListener("abort", onAbort);
			fn();
		};
		const onAbort = (): void => {
			settle(() => reject(signal.reason ?? new Error("aborted")));
		};
		signal.addEventListener("abort", onAbort, { once: true });
		promise.then(
			value => settle(() => resolve(value)),
			error => settle(() => reject(error)),
		);
	});
}

/** Maps an SDK error into the package error model (exit-code friendly). */
function mapClientError(error: unknown): TunnelError {
	if (error instanceof OpenTunnelClientError) {
		return new TunnelError("network", `opentunnel: ${error.message}`, {
			code: error.code ?? "E_OPENTUNNEL",
			cause: error,
		});
	}
	if (error instanceof Error) {
		return new TunnelError("network", `opentunnel: ${error.message}`, { cause: error });
	}
	return new TunnelError("network", `opentunnel: ${String(error)}`, { details: error });
}

function mapEvent(event: OpenTunnelClientEvent): TunnelEvent {
	return { ...event };
}

function mapStatus(status: OpenTunnelStatus): {
	state: "connecting" | "connected" | "reconnecting" | "stopped";
	hostname: string;
	connections: number;
	lastError?: string;
} {
	// "waiting-routes" collapses into "connecting": callers never route.
	const state = status.state === "waiting-routes" ? "connecting" : status.state;
	return {
		state,
		hostname: status.hostname,
		connections: status.connections,
		lastError: status.lastError,
	};
}

/**
 * `OpenTunnelStorage` over our per-profile record files.
 *
 * One file per profile holds the identity verbatim (`certificateExpiry`
 * as an ISO string on disk, revived to `Date` on load), the optional
 * `pending` provisioning state, and the shared metadata fields — which
 * `save`/`savePending` preserve through merges.
 */
export function createRecordStorage(dataDir: string): OpenTunnelStorage {
	const now = (): string => new Date().toISOString();
	const read = async (profile: string): Promise<Record<string, unknown>> => {
		try {
			const text = await fs.readFile(profileFilePath(dataDir, profile), "utf8");
			const parsed: unknown = JSON.parse(text);
			if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
				return parsed as Record<string, unknown>;
			}
			return {};
		} catch {
			return {};
		}
	};
	const write = async (profile: string, patch: Record<string, unknown>): Promise<void> => {
		await mergeRecordFile(dataDir, profile, { ...patch, updatedAt: now() });
	};

	return {
		profiles: async () => {
			const records = await listProfileRecords(dataDir);
			return records.map(record => record.profile);
		},
		load: async profile => reviveIdentity(await read(profile)),
		save: async (profile, tunnel) => {
			const existing = await read(profile);
			const patch: Record<string, unknown> = { ...toStoredIdentity(tunnel) };
			// createdAt travels with the record, not the identity: a renewed
			// certificate must not reset it.
			if (typeof existing["createdAt"] !== "string") {
				patch["createdAt"] = now();
			}
			await write(profile, patch);
		},
		loadPending: async profile => revivePending(await read(profile)),
		savePending: async (profile, pending) => {
			const existing = await read(profile);
			const patch: Record<string, unknown> = { pending: toStoredPending(pending) };
			if (typeof existing["createdAt"] !== "string") {
				patch["createdAt"] = now();
			}
			await write(profile, patch);
		},
		remove: async profile => {
			await removeProfileRecord(dataDir, profile);
		},
		list: async () => {
			const records = await listProfileRecords(dataDir);
			const tunnels: { profile: string; tunnel: OpenTunnelIdentity }[] = [];
			for (const record of records) {
				const identity = reviveIdentity(await read(record.profile));
				if (identity !== undefined) {
					tunnels.push({ profile: record.profile, tunnel: identity });
				}
			}
			return tunnels;
		},
	};
}

/** Serializes an identity for disk (Date -> ISO string). */
function toStoredIdentity(tunnel: OpenTunnelIdentity): Record<string, unknown> {
	return {
		id: tunnel.id,
		hostname: tunnel.hostname,
		token: tunnel.token,
		privateKey: tunnel.privateKey,
		certificate: tunnel.certificate,
		chain: tunnel.chain,
		certificateExpiry: tunnel.certificateExpiry.toISOString(),
	};
}

function toStoredPending(pending: OpenTunnelPendingIdentity): Record<string, unknown> {
	return {
		id: pending.id,
		hostname: pending.hostname,
		token: pending.token,
		privateKey: pending.privateKey,
		csr: pending.csr,
	};
}

/** Revives a record into an identity; undefined when incomplete. */
function reviveIdentity(record: Record<string, unknown>): OpenTunnelIdentity | undefined {
	for (const key of IDENTITY_KEYS) {
		if (typeof record[key] !== "string") {
			return undefined;
		}
	}
	const expiry = new Date(record["certificateExpiry"] as string);
	if (Number.isNaN(expiry.getTime())) {
		return undefined;
	}
	return {
		id: record["id"] as string,
		hostname: record["hostname"] as string,
		token: record["token"] as string,
		privateKey: record["privateKey"] as string,
		certificate: record["certificate"] as string,
		chain: record["chain"] as string,
		certificateExpiry: expiry,
	};
}

function revivePending(record: Record<string, unknown>): OpenTunnelPendingIdentity | undefined {
	const pending = record["pending"];
	if (pending === null || typeof pending !== "object" || Array.isArray(pending)) {
		return undefined;
	}
	const candidate = pending as Record<string, unknown>;
	for (const key of ["id", "hostname", "token", "privateKey", "csr"] as const) {
		if (typeof candidate[key] !== "string") {
			return undefined;
		}
	}
	return {
		id: candidate["id"] as string,
		hostname: candidate["hostname"] as string,
		token: candidate["token"] as string,
		privateKey: candidate["privateKey"] as string,
		csr: candidate["csr"] as string,
	};
}

/**
 * Re-exported for callers that need the public URL of a stored route
 * without a connection (the `status` command).
 */
export { publicUrl };
