import { DevtoolsStore } from "@vkma.dev/devtools/store";
import type {
	ClientInfo,
	ClientStatus,
	DevtoolsState,
	ExecResult,
	WireEvent,
} from "@vkma.dev/protocol";
import { MAX_PENDING_BUFFER } from "../shared/config.ts";
import type { HostMessage } from "../shared/protocol.ts";
import { Gate } from "./gate.ts";
import { BatchedHub, Hub } from "./hub.ts";
import { parseInspectorMessage, type ParsedInspectorMessage } from "./messages.ts";

/**
 * The inspect "node side" — the extension host script's counterpart,
 * living in the panel page itself (panel and store share one process,
 * so the panel reads the hubs directly instead of an RPC). Transport
 * agnostic: the PeerJS layer feeds it connections and raw messages,
 * everything below is pure state plus broadcasts.
 */

/** What the PeerJS layer registers for every live DataConnection. */
export interface HostChannel {
	send(message: HostMessage): void;
	close(): void;
}

export interface ApprovalRequest {
	clientId: string;
	info: ClientInfo;
	receivedAt: number;
}

interface ConnState {
	channel: HostChannel;
	/** Set by the first hello; heartbeats re-use it. */
	clientId?: string;
	/** Gate verdict while the human has not answered yet. */
	pending?: ApprovalRequest;
	/** Messages parked behind the gate (hello included), bounded. */
	buffered: ParsedInspectorMessage[];
	/** This connection passed the gate (allow-once or replay after
	 * approval) — dispatch must not re-park its own hello. */
	admitted?: boolean;
}

export class InspectHost {
	public readonly store = new DevtoolsStore();
	public readonly timelineHub = new BatchedHub<WireEvent>(100);
	public readonly clientsHub = new Hub<ClientStatus[]>();
	public readonly sessionResetHub = new Hub<{ clientId: string }>();
	public readonly approvalsHub = new Hub<ApprovalRequest[]>();

	private readonly gate = new Gate();
	private readonly conns = new Set<ConnState>();
	private readonly byClient = new Map<string, ConnState>();
	private fingerprintTimer: ReturnType<typeof setInterval> | undefined;

	public constructor() {
		// The registry's online/offline fingerprint flips on a timer, not
		// on hello — broadcast it like every node side does. (Also
		// recomputed on hello: a throttled background panel skips timers.)
		let lastFingerprint = "";
		this.fingerprintTimer = setInterval(() => {
			const fingerprint = this.fingerprint();
			if (fingerprint !== lastFingerprint) {
				lastFingerprint = fingerprint;
				this.broadcastClients();
			}
		}, 5_000);
	}

	public dispose(): void {
		clearInterval(this.fingerprintTimer);
		for (const state of this.conns) {
			state.channel.close();
		}
		this.conns.clear();
		this.byClient.clear();
	}

	// --- gate ----------------------------------------------------------------------

	public isGateEnabled(): boolean {
		return this.gate.isEnabled();
	}

	public setGateEnabled(enabled: boolean): void {
		this.gate.setEnabled(enabled);
		// Turning the gate off lets every parked connection in right away —
		// their parked messages replay in arrival order.
		if (!enabled) {
			const parked = [...this.conns].filter(state => state.pending !== undefined);
			for (const state of parked) {
				const messages = state.buffered;
				state.pending = undefined;
				state.buffered = [];
				for (const message of messages) {
					this.dispatch(state, message);
				}
			}
		}
		this.publishApprovals();
	}

	/** Approve a parked connection and replay everything it sent while
	 * the human was deciding. */
	public approve(clientId: string, remember: boolean): void {
		this.gate.approve(clientId, remember);
		const states = [...this.conns].filter(state => state.pending?.clientId === clientId);
		for (const state of states) {
			const parked = state.buffered;
			state.pending = undefined;
			state.buffered = [];
			state.admitted = true;
			for (const message of parked) {
				this.dispatch(state, message);
			}
		}
		this.publishApprovals();
	}

	/** Deny a parked connection: close it and stay silent if it returns
	 * (for this panel load). */
	public deny(clientId: string): void {
		this.gate.deny(clientId);
		for (const state of this.conns) {
			if (state.pending?.clientId === clientId) {
				this.dropChannel(state.channel);
			}
		}
		this.publishApprovals();
	}

	// --- connections ---------------------------------------------------------------

	public addChannel(channel: HostChannel): void {
		this.conns.add({ channel, buffered: [] });
	}

	public dropChannel(channel: HostChannel): void {
		const state = this.find(channel);
		if (state === undefined) {
			return;
		}
		this.conns.delete(state);
		if (state.clientId !== undefined && this.byClient.get(state.clientId) === state) {
			this.byClient.delete(state.clientId);
		}
		if (state.pending !== undefined) {
			this.publishApprovals();
		}
		channel.close();
	}

	/** The PeerJS layer's data tap — zod first, gate second. */
	public handleMessage(channel: HostChannel, data: unknown): void {
		const state = this.find(channel);
		if (state === undefined) {
			return;
		}
		const message = parseInspectorMessage(data);
		if (message === undefined) {
			return; // malformed foreign input drops silently
		}
		if (state.pending !== undefined) {
			if (state.buffered.length < MAX_PENDING_BUFFER) {
				state.buffered.push(message);
			}
			return;
		}
		this.dispatch(state, message);
	}

	// --- panel surface ---------------------------------------------------------------

	public snapshot(): DevtoolsState {
		return {
			runId: this.store.runId,
			events: this.store.snapshotEvents(),
			clients: this.store.listClients(),
		};
	}

	public pendingApprovals(): ApprovalRequest[] {
		return [...this.conns]
			.map(state => state.pending)
			.filter((pending): pending is ApprovalRequest => pending !== undefined);
	}

	public async execute(
		clientId: string,
		name: string,
		params: Record<string, unknown> | undefined,
	): Promise<ExecResult> {
		if (this.store.getClient(clientId) === undefined) {
			return { status: "no-client", clientId };
		}
		const { execId, promise } = this.store.beginExec();
		this.byClient.get(clientId)?.channel.send({
			v: 1,
			t: "execute",
			execId,
			clientId,
			name,
			params,
		});
		// A dropped connection settles through the store's 20 s guard.
		return promise;
	}

	public deleteClients(clientIds: string[]): string[] {
		const removed = this.store.deleteClients(clientIds);
		if (removed.length > 0) {
			this.broadcastClients();
		}
		return removed;
	}

	// --- internals -------------------------------------------------------------------

	private find(channel: HostChannel): ConnState | undefined {
		for (const state of this.conns) {
			if (state.channel === channel) {
				return state;
			}
		}
		return undefined;
	}

	private dispatch(state: ConnState, message: ParsedInspectorMessage): void {
		switch (message.t) {
			case "hello": {
				const info = message.info;
				if (this.gate.isDenied(info.clientId)) {
					this.dropChannel(state.channel);
					return;
				}
				if (
					!state.admitted &&
					this.gate.isEnabled() &&
					!this.gate.isApproved(info.clientId)
				) {
					state.pending = { clientId: info.clientId, info, receivedAt: Date.now() };
					state.buffered.push(message);
					this.publishApprovals();
					return;
				}
				state.admitted = true;
				this.register(state, info);
				return;
			}
			case "events": {
				const client = this.store.getClient(message.clientId);
				if (client === undefined) {
					return; // hello must precede — the store drops unknowns anyway
				}
				const out = message.events.filter(event => event.name !== "vk-connect");
				const stamped = this.store.pushEvents(message.clientId, out);
				if (stamped.length > 0) {
					this.timelineHub.pushMany(stamped);
				}
				return;
			}
			case "exec-result": {
				this.store.settleExec(message);
				return;
			}
		}
	}

	/** hello semantics — the devtools/extension contract verbatim. */
	private register(state: ConnState, info: ClientInfo): void {
		if (state.clientId === undefined) {
			state.clientId = info.clientId;
		}
		this.byClient.set(info.clientId, state);

		const previous = this.store.getClient(info.clientId);
		const sessionChanged = previous !== undefined && previous.sessionId !== info.sessionId;
		// Spy → direct flip: the page bridge's tap replays the whole page
		// load, so the spy-era reconstruction must not survive next to it.
		const captureFlipped = previous !== undefined && !previous.bridge && info.bridge;

		if (sessionChanged || captureFlipped) {
			this.store.purgeEvents(info.clientId);
			this.sessionResetHub.publish({ clientId: info.clientId });
			this.store.touchClient(info);
			this.broadcastClients();
			return;
		}

		if (this.store.touchClient(info)) {
			this.broadcastClients();
		}
	}

	private broadcastClients(): void {
		this.clientsHub.publish(this.store.listClients());
	}

	private publishApprovals(): void {
		this.approvalsHub.publish(this.pendingApprovals());
	}

	private fingerprint(): string {
		return this.store
			.listClients()
			.map(client => `${client.clientId}:${client.online ? 1 : 0}`)
			.join(",");
	}
}
