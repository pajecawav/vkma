import { VERIFICATION_TIMEOUT_MS } from "../shared/config.ts";
import {
	PROTOCOL_VERSION,
	type HostMessage,
	type InspectChallengeProofMessage,
	type InspectExecuteMessage,
	type InspectorMessage,
} from "../shared/protocol.ts";
import { randomNonce, verifyNonce } from "../shared/signing.ts";

/**
 * The credential gate on the dial direction. NOTHING sensitive leaves
 * the inspector until the answering peer signs the fresh challenge:
 * hello carries the launch params (sign included), the page locator
 * and the clientId; the event backlog and exec-results are just as
 * sensitive. The peer id proves nothing (the broker hands a stopped
 * id to whoever registers it first), so the proof of the panel's
 * signing key is the only accepted answer. A squatter gets a
 * challenge, times out or fails verification, and the connection is
 * dropped into the ordinary redial loop.
 *
 * Credentials queue here (bounded) while unverified and ship the
 * moment a proof verifies, never through the transport's own queue,
 * which flushes to whoever opens the channel.
 */

/** Bound on credential-bearing messages parked while unverified
 * (hello dedupes; event batches arrive every FLUSH_MS). */
const MAX_CREDENTIALS = 500;

export interface DialTrustLinks {
	/** Only challenge and verified credentials go through here. */
	send(message: InspectorMessage): void;
	isOpen(): boolean;
	/** Drop the live connection. The close event triggers redial. */
	drop(): void;
	/** Verification succeeded: say hello and flush the backlog. */
	onVerified(): void;
	/** A verified execute, run it through the capture. */
	onExecute(request: InspectExecuteMessage): void;
}

export class DialTrust {
	private verified = false;
	private pendingNonce?: string;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private warnedStale = false;
	/** Connection generation: proofs are bound to the channel they were
	 * challenged on. An async verify landing after a close+redial must
	 * not admit the NEW channel (its nonce was never signed). */
	private epoch = 0;
	private readonly credentials: InspectorMessage[] = [];

	public constructor(
		/** The panel public key from the snippet URL (`k=`). */
		private readonly verifyKey: string | undefined,
		private readonly links: DialTrustLinks,
	) {}

	public isVerified(): boolean {
		return this.verified;
	}

	/** The DataChannel opened: credentials stay locked, challenge out. */
	public channelOpened(): void {
		this.epoch++;
		this.verified = false;
		clearTimeout(this.timer);
		if (this.verifyKey === undefined) {
			// A stale snippet without ?k= cannot verify anyone. Shipping
			// credentials to an unprovable peer was the bug this fixes.
			if (!this.warnedStale) {
				this.warnedStale = true;
				console.error(
					"[vkma-inspect] stale snippet: no signing key in the URL — re-copy it from the panel",
				);
			}
			return;
		}
		this.pendingNonce = randomNonce();
		this.links.send({
			v: PROTOCOL_VERSION,
			t: "challenge",
			nonce: this.pendingNonce,
		});
		this.timer = setTimeout(() => {
			// No proof. The dial landed on something that cannot sign.
			this.channelClosed();
			this.links.drop();
		}, VERIFICATION_TIMEOUT_MS);
	}

	/** The DataChannel went down: every proof is bound to one nonce and
	 * one connection. The next open starts over. */
	public channelClosed(): void {
		this.epoch++;
		this.verified = false;
		this.pendingNonce = undefined;
		clearTimeout(this.timer);
	}

	/** Queue a credential-bearing message (hello, event batch, exec-
	 * result): ships the moment the connection verifies, never before.
	 * A queued hello is replaced by newer ones, since heartbeats would pile
	 * up stale registrations otherwise. */
	public enqueue(message: InspectorMessage): void {
		if (this.verified && this.links.isOpen()) {
			this.links.send(message);
			return;
		}
		if (message.t === "hello") {
			const previous = this.credentials.findIndex(item => item.t === "hello");
			if (previous !== -1) {
				this.credentials[previous] = message;
				return;
			}
		}
		if (this.credentials.length >= MAX_CREDENTIALS) {
			this.credentials.shift();
		}
		this.credentials.push(message);
	}

	public onMessage(message: HostMessage): void {
		if (message.t === "challenge-proof") {
			void this.onProof(message);
			return;
		}
		// Executes from an unverified connection drop silently. The
		// verified flag IS the answerer's proof of identity (the hello
		// that discloses the clientId never reached the peer otherwise).
		if (message.t === "execute" && this.verified) {
			this.links.onExecute(message);
		}
	}

	private async onProof(message: InspectChallengeProofMessage): Promise<void> {
		const nonce = this.pendingNonce;
		const generation = this.epoch;
		if (nonce === undefined || message.nonce !== nonce || this.verifyKey === undefined) {
			return; // unsolicited, stale, or a cross-connection replay
		}
		this.pendingNonce = undefined;
		const ok = await verifyNonce(this.verifyKey, nonce, message.sig);
		if (this.epoch !== generation) {
			// The channel died (or a new one opened) while the crypto ran:
			// this proof names a nonce the CURRENT channel never challenged.
			return;
		}
		if (!ok) {
			this.links.drop(); // the signer is not the panel. Drop, redial
			return;
		}
		clearTimeout(this.timer);
		this.verified = true;
		this.flushCredentials();
		this.links.onVerified();
	}

	private flushCredentials(): void {
		if (!this.verified || !this.links.isOpen()) {
			return;
		}
		const messages = this.credentials.splice(0);
		for (const message of messages) {
			this.links.send(message);
		}
	}
}
