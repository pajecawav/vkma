import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { ICE_SERVERS, SIGNALING } from "../shared/config.ts";
import type { HostMessage } from "../shared/protocol.ts";

/**
 * The UI side of the WebRTC mesh: one Peer registered on the broker
 * under the panel's stable id; every incoming DataConnection is handed
 * to the host as a channel. No TURN exists in the config — direct
 * connection or honest failure (the STUN-only policy, see config.ts).
 */

export interface PeerStatus {
	state: "starting" | "online" | "error";
	lastError?: string;
	/** The broker refused our id twice — hijack or a stale registration;
	 * the panel offers Rotate. */
	idTaken?: boolean;
}

/** The DataConnection adapter the host consumes. */
export interface PeerChannel {
	send(message: HostMessage): void;
	close(): void;
	onData(listener: (data: unknown) => void): void;
	onClose(listener: () => void): void;
}

export class InspectPeer {
	private peer?: Peer;
	private status: PeerStatus = { state: "starting" };
	private unavailableRetries = 0;
	private retryTimer: ReturnType<typeof setTimeout> | undefined;

	public constructor(
		private readonly handlers: {
			onStatus(status: PeerStatus): void;
			onChannel(channel: PeerChannel): void;
		},
	) {}

	public getStatus(): PeerStatus {
		return this.status;
	}

	public start(id: string): void {
		this.stopPeer();
		this.setStatus({ state: "starting" });
		const peer = new Peer(id, {
			debug: 0,
			...SIGNALING,
			config: { iceServers: ICE_SERVERS },
		});
		this.peer = peer;

		peer.on("open", () => {
			this.unavailableRetries = 0;
			this.setStatus({ state: "online" });
		});

		peer.on("connection", conn => {
			this.handlers.onChannel(adaptConnection(conn));
		});

		// The broker socket dropped (network blip, cloud restart): dial
		// back. Live DataChannels survive this untouched — the phone keeps
		// streaming; only NEW dials need the broker again.
		peer.on("disconnected", () => {
			if (this.peer === peer) {
				peer.reconnect();
			}
		});

		peer.on("error", (error: Error & { type?: string }) => {
			const type = error.type ?? "";
			if (type === "unavailable-id") {
				// The id is taken on the broker: another live panel holds it,
				// or a stale registration has not expired yet. One retry with
				// the same id, then surface it — Rotate mints a fresh id.
				if (this.unavailableRetries++ < 1) {
					this.retryTimer = setTimeout(() => this.start(id), 2_000);
					return;
				}
				this.setStatus({
					state: "error",
					lastError: "The peer id is taken on the signaling server.",
					idTaken: true,
				});
				return;
			}
			if (type === "network" || type === "socket-error" || type === "socket-closed") {
				// peerjs re-emits/reconnects the socket itself — stay online.
				return;
			}
			this.setStatus({ state: "error", lastError: error.message });
		});
	}

	/** Same id, fresh peer — the panel's reconnect affordance. */
	public restart(): void {
		const id = this.peer?.id;
		if (id !== undefined) {
			this.start(id);
		}
	}

	public stopPeer(): void {
		clearTimeout(this.retryTimer);
		this.retryTimer = undefined;
		if (this.peer !== undefined) {
			this.peer.destroy();
			this.peer = undefined;
		}
	}

	private setStatus(status: PeerStatus): void {
		this.status = status;
		this.handlers.onStatus(status);
	}
}

function adaptConnection(conn: DataConnection): PeerChannel {
	const dataListeners = new Set<(data: unknown) => void>();
	const closeListeners = new Set<() => void>();
	conn.on("data", data => {
		for (const listener of dataListeners) {
			listener(data);
		}
	});
	const closed = () => {
		for (const listener of closeListeners) {
			listener();
		}
	};
	conn.on("close", closed);
	conn.on("error", closed);
	return {
		send(message) {
			if (conn.open) {
				void conn.send(message);
			}
		},
		close() {
			conn.close();
		},
		onData(listener) {
			dataListeners.add(listener);
		},
		onClose(listener) {
			closeListeners.add(listener);
		},
	};
}
