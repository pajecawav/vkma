import type { ClientInfo, WireEvent } from "../shared/protocol.ts";

const RING_LIMIT = 500;
const CLIENT_TTL_MS = 15_000;
const EXEC_TIMEOUT_MS = 20_000;

interface PendingExec {
	settle: (result: import("../shared/protocol.ts").ExecResult) => void;
	timer: ReturnType<typeof setTimeout>;
}

/**
 * Node-side state: a ring buffer of bridge events, the connected-client
 * registry (staleness-pruned), and pending execute round-trips.
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

	/** @returns dropped clients, if any (caller broadcasts). */
	public pruneClients(now = Date.now()): ClientInfo[] {
		const dropped: ClientInfo[] = [];
		for (const [clientId, info] of this.clients) {
			if (now - info.lastSeenAt > CLIENT_TTL_MS) {
				this.clients.delete(clientId);
				dropped.push(info);
			}
		}
		return dropped;
	}

	public getClient(clientId: string): ClientInfo | undefined {
		return this.clients.get(clientId);
	}

	public listClients(): ClientInfo[] {
		return [...this.clients.values()].toSorted((a, b) => a.connectedAt - b.connectedAt);
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
