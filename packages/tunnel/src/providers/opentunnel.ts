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
	// Stamp the shared metadata before connecting: `list`/`status` must see
	// the target even if this run never reaches a healthy connection.
	await mergeRecordFile(options.dataDir, options.profile, {
		lastTarget: target,
		lastRoute: options.route,
		updatedAt: new Date().toISOString(),
	});

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

	let connection: Awaited<ReturnType<typeof client.tunnel.connect>>;
	try {
		connection = await client.tunnel.connect({
			profile: options.profile,
			routes: { [options.route]: target },
			signal: options.signal,
			onEvent: event => options.onEvent?.(mapEvent(event)),
		});
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

	// The SDK's own abort listener closes the connection concurrently with
	// ours; the guard keeps teardown single-shot and the bounds keep a
	// half-dead bridge from hanging `close()` forever (a stuck SDK teardown
	// must never wedge the CLI process).
	let tornDown = false;
	const stopKeepAlive = startBridgeKeepAlive(connection, options);

	const teardown = async (): Promise<void> => {
		if (tornDown) {
			return;
		}
		tornDown = true;
		stopKeepAlive();
		await bounded(connection.close());
		await bounded(client.dispose());
	};

	return {
		hostname: connection.tunnel.hostname,
		urls: connection.urls,
		events: mapEventIterable(connection.events),
		status: () => mapStatus(connection.status()),
		close: teardown,
		closed: connection.closed.finally(() => {
			void teardown();
		}),
	};
}

/**
 * Periodic self-probe through the public URL. Idle bridges get dropped
 * silently (NATs, the service's own idle policy), and a silent drop means
 * the close frame is never delivered — the server keeps the route bound
 * to the ghost session until its own timeout, and every reconnect hits
 * `route_conflict`. A visitor connection every ~20 s keeps bytes flowing
 * in both directions, which keeps pongs coming and the route alive.
 * Unref'd: the timer never holds the process open.
 */
function startBridgeKeepAlive(
	connection: Awaited<ReturnType<ReturnType<typeof create>["tunnel"]["connect"]>>,
	options: TunnelProviderConnectOptions,
): () => void {
	if (options.keepAlive === false) {
		return () => undefined;
	}
	const url = publicUrl(options.route, connection.tunnel.hostname);
	const timer = setInterval(() => {
		// Only while a bridge is actually attached: mid-reconnect probes
		// would just burn the timeout.
		if (mapStatus(connection.status()).state !== "connected") {
			return;
		}
		void fetch(url, { signal: AbortSignal.timeout(10_000), redirect: "manual" })
			.then(response => {
				response.body?.cancel().catch(() => undefined);
			})
			.catch(() => undefined);
	}, 20_000);
	timer.unref?.();
	return () => clearInterval(timer);
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

/** Adapts the SDK's AsyncIterable to our (identical) event union. */
async function* mapEventIterable(
	events: AsyncIterable<OpenTunnelClientEvent>,
): AsyncGenerator<TunnelEvent> {
	for await (const event of events) {
		yield mapEvent(event);
	}
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
