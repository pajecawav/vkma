import { loadOrCreateSigningKey, signNonce } from "../shared/signing.ts";
import { InspectHost, type ApprovalRequest } from "./host.ts";
import { Hub } from "./hub.ts";
import {
	isPeerIdPinned,
	pinPeerId,
	resolvePeerId,
	rotatePeerId,
	stopClaimGuard,
	unpinPeerId,
} from "./peer-id.ts";
import { InspectPeer, type PeerStatus } from "./peer.ts";

/**
 * Host + PeerJS wired together, created ONCE per panel page (module
 * scope in the entry — it must survive React StrictMode remounts and
 * keeps its identity across reconnects).
 */

export interface InspectRuntime {
	host: InspectHost;
	peer: InspectPeer;
	/** Broker-side state, published on every change (panel subscribes). */
	statusHub: Hub<PeerStatus>;
	peerStatus(): PeerStatus;
	/** The snippet base: this origin + the settled peer id. */
	peerId(): string | undefined;
	/** The snippet's `k=` value — the public half of the signing key
	 * the panel answers challenges with. */
	publicKey(): string | undefined;
	/** Whether fresh tabs adopt this id (the snippet-stability pin). */
	pinned(): boolean;
	setPinned(pinned: boolean): void;
	rotate(): void;
	reconnect(): void;
	dispose(): void;
}

export function createInspectRuntime(): InspectRuntime {
	const host = new InspectHost();
	const statusHub = new Hub<PeerStatus>();
	let status: PeerStatus = { state: "starting" };
	let currentId: string | undefined;
	let currentPublicKey: string | undefined;

	// The dial-direction trust anchor: load (or mint) the signing key,
	// answer the inspectors' challenges with it, publish the public half
	// for the snippet. Until it loads, challenges go unanswered and the
	// dials redial — no credentials ever travel unverified.
	void loadOrCreateSigningKey()
		.then(key => {
			host.setSigner(nonce => signNonce(key.privateKey, nonce));
			currentPublicKey = key.publicKey;
		})
		.catch(() => {
			status = { state: "error", lastError: "Could not create the signing key." };
			statusHub.publish(status);
		});

	const peer = new InspectPeer({
		onStatus(next) {
			status = next;
			statusHub.publish(next);
		},
		onChannel(channel) {
			host.addChannel(channel);
			channel.onData(data => host.handleMessage(channel, data));
			channel.onClose(() => host.dropChannel(channel));
		},
	});

	void resolvePeerId()
		.then(id => {
			currentId = id;
			peer.start(id);
		})
		.catch(() => {
			status = { state: "error", lastError: "Could not settle a peer id." };
			statusHub.publish(status);
		});

	return {
		host,
		peer,
		statusHub,
		peerStatus: () => status,
		peerId: () => currentId,
		publicKey: () => currentPublicKey,
		pinned: () => isPeerIdPinned(),
		setPinned(pin) {
			if (currentId === undefined) {
				return;
			}
			if (pin) {
				pinPeerId(currentId);
			} else {
				unpinPeerId();
			}
		},
		rotate() {
			currentId = rotatePeerId();
			peer.start(currentId);
			// Trust is re-anchored to a fresh capability: remembered
			// approvals granted under the old id must not survive it.
			host.clearApprovals();
		},
		reconnect() {
			peer.restart();
		},
		dispose() {
			peer.stopPeer();
			host.dispose();
			stopClaimGuard();
		},
	};
}

export type { ApprovalRequest };
