import type { ClientInfo, ClientStatus, WireEvent } from "../shared/protocol.ts";

const RING_LIMIT = 500;
const CLIENT_ONLINE_TTL_MS = 15_000;
const REGISTRY_CAP = 24;
const EXEC_TIMEOUT_MS = 20_000;

interface PendingExec {
	settle: (result: import("../shared/protocol.ts").ExecResult) => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * Node-side state: a ring buffer of bridge events, the connected-client
 * registry (heartbeat-stale clients turn offline, entries capped), and
 * pending execute round-trips.
 */
export class DevtoolsStore {
	private events: WireEvent[] = [];
	private seq = 0;
	private readonly clients = new Map<string, ClientInfo>();
	private readonly pendingExecs = new Map<number, PendingExec>();
	private execCounter = 0;

	/** @returns true if the registry changed (caller broadcasts). */
	public touchClient(info: ClientInfo): boolean {
		const existing = this.clients.get(info.clientId);
		if (existing && existing.lastSeenAt === info.lastSeenAt) {
			return false;
		}
		this.clients.set(info.clientId, { ...info });
		return true;
	}

	/** A page reload: the client's previous session history is dead. */
	public purgeEvents(clientId: string): void {
		this.events = this.events.filter(event => event.clientId !== clientId);
	}

	/**
	 * Clients never leave the registry on a timer — a background tab's
	 * heartbeat is throttled by Chrome and would flap them offline/online
	 * as disappear/reappear. They are marked offline past the heartbeat TTL
	 * instead, and only dropped when the registry outgrows its cap (oldest
	 * offline first).
	 */
	public listClients(now = Date.now()): ClientStatus[] {
		const statuses = [...this.clients.values()]
			.map(info => ({
				...info,
				online: now - info.lastSeenAt <= CLIENT_ONLINE_TTL_MS,
			}))
			.toSorted((a, b) => {
				if (a.online !== b.online) {
					return a.online ? -1 : 1;
				}
				return a.connectedAt - b.connectedAt;
			});
		if (statuses.length > REGISTRY_CAP) {
			const keepOnline = new Set(
				statuses.filter(status => status.online).map(status => status.clientId),
			);
			let overflow = statuses.length - REGISTRY_CAP;
			for (const status of statuses) {
				if (overflow === 0) {
					break;
				}
				if (!status.online && !keepOnline.has(status.clientId)) {
					this.clients.delete(status.clientId);
					overflow--;
				}
			}
			return statuses.filter(status => this.clients.has(status.clientId));
		}
		return statuses;
	}

	public getClient(clientId: string): ClientInfo | undefined {
		return this.clients.get(clientId);
	}

	/** Assigns global seq numbers; drops events from unknown clients. */
	public pushEvents(
		clientId: string,
		events: Omit<WireEvent, "seq" | "clientId">[],
	): WireEvent[] {
		if (!this.clients.has(clientId)) {
			return [];
		}
		const stamped = events.map(event => ({
			...event,
			clientId,
			seq: ++this.seq,
		}));
		this.events.push(...stamped);
		if (this.events.length > RING_LIMIT) {
			this.events.splice(0, this.events.length - RING_LIMIT);
		}
		return stamped;
	}

	public snapshotEvents(): WireEvent[] {
		return [...this.events];
	}

	public beginExec(): {
		execId: number;
		promise: Promise<import("../shared/protocol.ts").ExecResult>;
	} {
		const execId = ++this.execCounter;
		let resolve: (result: import("../shared/protocol.ts").ExecResult) => void;
		const promise = new Promise<import("../shared/protocol.ts").ExecResult>(res => {
			resolve = res;
		});
		const timer = setTimeout(() => {
			this.pendingExecs.delete(execId);
			resolve({ status: "timeout" });
		}, EXEC_TIMEOUT_MS);
		this.pendingExecs.set(execId, {
			settle: result => {
				clearTimeout(timer);
				this.pendingExecs.delete(execId);
				resolve(result);
			},
			timer,
		});
		return { execId, promise };
	}

	/** @returns true if a pending execute was resolved. */
	public settleExec(report: {
		execId: number;
		clientId: string;
		ok: boolean;
		payload?: unknown;
	}): boolean {
		const pending = this.pendingExecs.get(report.execId);
		if (!pending) {
			return false;
		}
		pending.settle({
			status: report.ok ? "ok" : "error",
			payload: report.payload,
		});
		return true;
	}
}
