import { DevtoolsStore } from "@vkma.dev/devtools/store";
import type {
	ClientInfo,
	ClientStatus,
	DevtoolsState,
	ExecResult,
	WireEvent,
} from "@vkma.dev/protocol";
import { MAX_CONNS, MAX_PARKED_BYTES, MAX_PENDING_BUFFER } from "../shared/config.ts";
import { PROTOCOL_VERSION, type HostMessage } from "../shared/protocol.ts";
import { Gate } from "./gate.ts";
import { BatchedHub, Hub } from "./hub.ts";
import {
	parseInspectorMessage,
	type ParsedChallenge,
	type ParsedInspectorMessage,
} from "./messages.ts";

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
	/** Set by the first hello; frozen afterwards — one connection, one
	 * identity (heartbeats may not re-claim a different clientId). */
	clientId?: string;
	/** Gate verdict while the human has not answered yet. */
	pending?: ApprovalRequest;
	/** Messages parked behind the gate (hello included), bounded by count
	 * AND bytes; replayed in arrival order once the connection is
	 * admitted. */
	buffered: ParsedInspectorMessage[];
	parkedBytes: number;
	/** This connection passed the gate (allow-once, always-allow, or the
	 * gate being off). Admission is a property of the CONNECTION: until
	 * it is set, every message type parks — not only hello. */
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
	/** Signs the inspectors' challenges — the dial-direction trust anchor
	 * (shared/signing.ts). Set once the key pair has loaded. */
	private signer?: (nonce: string) => Promise<string>;

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
		// Turning the gate off lets every undecided connection in right
		// away — every parked connection, not only those with a pending
		// hello — and their parked messages replay in arrival order.
		if (!enabled) {
			for (const state of this.conns) {
				if (state.admitted) {
					continue;
				}
				const messages = state.buffered;
				state.pending = undefined;
				state.buffered = [];
				state.parkedBytes = 0;
				state.admitted = true;
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
			state.parkedBytes = 0;
			state.admitted = true;
			for (const message of parked) {
				this.dispatch(state, message);
			}
		}
		this.publishApprovals();
	}

	/** Deny a parked connection: close it and stay silent if it returns
	 * (for this panel load). A denial also revokes any persisted
	 * "Always allow" grant for the id — and disconnects an already
	 * admitted connection, so a trusted-then-hostile page stops
	 * streaming without a panel reload. */
	public deny(clientId: string): void {
		this.gate.deny(clientId);
		for (const state of this.conns) {
			if (state.pending?.clientId === clientId || state.clientId === clientId) {
				this.dropChannel(state.channel);
			}
		}
		this.publishApprovals();
	}

	/** Rotate: trust is re-anchored to a fresh capability — remembered
	 * approvals from the old id's world must not survive it. */
	public clearApprovals(): void {
		this.gate.clearApproved();
		this.publishApprovals();
	}

	// --- connections ---------------------------------------------------------------

	/** The dial-direction trust anchor: an inspector ships credentials
	 * only after this signature verifies (until the key has loaded the
	 * challenges go unanswered and dials redial — self-healing). */
	public setSigner(signer: (nonce: string) => Promise<string>): void {
		this.signer = signer;
	}

	public addChannel(channel: HostChannel): void {
		// Bounded connection set: every parked connection waits for a
		// human answer, so admission capacity is operator-owned.
		if (this.conns.size >= MAX_CONNS) {
			channel.close();
			return;
		}
		this.conns.add({ channel, buffered: [], parkedBytes: 0 });
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
		// The challenge is answered BEFORE any admission logic, by design:
		// the proof discloses nothing (the public key ships in the
		// snippet), and without it the inspector never sends the hello —
		// no approval card could ever surface.
		if (message.t === "challenge") {
			void this.answerChallenge(state, message);
			return;
		}
		// Admission is a property of the CONNECTION, not of the hello
		// branch: an undecided connection parks EVERY message type
		// (bounded), so a peer that never says hello — and therefore never
		// faces an approval card — cannot reach the store at all. The
		// hello itself still flows to dispatch: it is the message that
		// decides (deny / park behind a card / auto-admit a remembered id).
		if (!state.admitted && this.gate.isEnabled() && message.t !== "hello") {
			this.park(state, message);
			return;
		}
		if (!this.gate.isEnabled()) {
			state.admitted = true; // gate off: admission is implicit
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
		const bound = this.byClient.get(clientId);
		if (this.store.getClient(clientId) === undefined || bound === undefined) {
			return { status: "no-client", clientId };
		}
		// The pending exec remembers the channel it was routed to: an
		// exec-result settles it only when it returns on that connection.
		const { execId, promise } = this.store.beginExec(bound.channel);
		bound.channel.send({
			v: 1,
			t: "execute",
			execId,
			clientId,
			name,
			params,
		});
		// A dropped connection settles through the store's 60 s guard.
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

	private async answerChallenge(state: ConnState, message: ParsedChallenge): Promise<void> {
		const signer = this.signer;
		if (signer === undefined) {
			return; // key still loading — the inspector redials
		}
		try {
			const sig = await signer(message.nonce);
			state.channel.send({
				v: PROTOCOL_VERSION,
				t: "challenge-proof",
				nonce: message.nonce,
				sig,
			});
		} catch {
			return; // signing failure is silence — the dial redials
		}
	}

	private find(channel: HostChannel): ConnState | undefined {
		for (const state of this.conns) {
			if (state.channel === channel) {
				return state;
			}
		}
		return undefined;
	}

	/** Park a message behind the gate: bounded by count AND bytes (a
	 * count-only cap lets one oversized message park megabytes). */
	private park(state: ConnState, message: ParsedInspectorMessage): void {
		if (state.buffered.length >= MAX_PENDING_BUFFER) {
			return; // drop-newest, bounded
		}
		const size = JSON.stringify(message)?.length ?? 0;
		if (state.parkedBytes + size > MAX_PARKED_BYTES) {
			return; // byte budget exhausted — the card still surfaces
		}
		state.buffered.push(message);
		state.parkedBytes += size;
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
					this.park(state, message);
					this.publishApprovals();
					return;
				}
				state.admitted = true;
				this.register(state, info);
				return;
			}
			case "events": {
				// Identity is the connection's, not the message's: an
				// admitted connection may report events only for the
				// clientId it registered with.
				if (state.clientId === undefined || state.clientId !== message.clientId) {
					return;
				}
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
				// Same identity binding, plus the store's owner check: the
				// report must come back on the connection the execute was
				// routed to.
				if (state.clientId === undefined || state.clientId !== message.clientId) {
					return;
				}
				this.store.settleExec(message, state.channel);
				return;
			}
		}
	}

	/** hello semantics — the devtools/extension contract verbatim, plus
	 * the one-connection-one-identity freeze. */
	private register(state: ConnState, info: ClientInfo): void {
		if (state.clientId !== undefined && state.clientId !== info.clientId) {
			return; // one connection, one identity — heartbeats only
		}
		const incumbent = this.byClient.get(info.clientId);
		if (incumbent !== undefined && incumbent !== state) {
			// A second live connection claiming a known id: the incumbent
			// keeps it, the claimant is closed — never a silent takeover
			// (the operator's executes must not reroute to an unapproved
			// peer that learned the id).
			this.dropChannel(state.channel);
			return;
		}
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
