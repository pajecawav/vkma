import { InspectHost, type ApprovalRequest } from "./host.ts";
import { Hub } from "./hub.ts";
import { resolvePeerId, rotatePeerId, stopClaimGuard } from "./peer-id.ts";
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
	rotate(): void;
	reconnect(): void;
	dispose(): void;
}

export function createInspectRuntime(): InspectRuntime {
	const host = new InspectHost();
	const statusHub = new Hub<PeerStatus>();
	let status: PeerStatus = { state: "starting" };
	let currentId: string | undefined;

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
		rotate() {
			currentId = rotatePeerId();
			peer.start(currentId);
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
