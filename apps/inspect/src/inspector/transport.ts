import Peer from "peerjs";
import type { DataConnection } from "peerjs";
import { ICE_SERVERS, RECONNECT_MAX_MS, RECONNECT_MIN_MS, SIGNALING } from "../shared/config.ts";
import type { HostMessage, InspectorMessage } from "../shared/protocol.ts";

/**
 * The inspector side of the WebRTC link: one anonymous peer dialing the
 * panel's id forever (the page outlives any panel reload — a stable id
 * reconnects without touching the snippet). This layer is transport
 * only — the challenge-response gate (dial-trust.ts) owns what may
 * travel on the channel. Direct or nothing: no TURN server exists in
 * the config, an unpierceable pair just keeps retrying.
 */

/** Cap on the ICE dance before we hang up and redial. */
const CONNECT_TIMEOUT_MS = 15_000;
/** Bound the outbound queue (heartbeats make it self-draining anyway). */
const MAX_QUEUE = 500;

export class InspectorTransport {
	private peer?: Peer;
	private conn?: DataConnection;
	private queue: InspectorMessage[] = [];
	private delay = RECONNECT_MIN_MS;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private watchdog: ReturnType<typeof setTimeout> | undefined;
	private stopped = false;

	public constructor(
		private readonly targetId: string,
		private readonly handlers: {
			onMessage(message: HostMessage): void;
			onOpen(): void;
			/** The channel went down (also fires for our own drop()). */
			onDown(): void;
		},
	) {}

	public start(): void {
		this.dial();
	}

	public stop(): void {
		this.stopped = true;
		clearTimeout(this.timer);
		clearTimeout(this.watchdog);
		this.conn?.close();
		this.conn = undefined;
		this.peer?.destroy();
		this.peer = undefined;
	}

	public isOpen(): boolean {
		return this.conn?.open ?? false;
	}

	/** Drop the live connection (failed verification): the close event
	 * triggers the ordinary redial-with-backoff. */
	public drop(): void {
		this.conn?.close();
	}

	public send(message: InspectorMessage): void {
		if (this.queue.length >= MAX_QUEUE) {
			this.queue.shift();
		}
		this.queue.push(message);
		this.flush();
	}

	private dial(): void {
		if (this.stopped) {
			return;
		}
		const peer = new Peer({
			debug: 0,
			...SIGNALING,
			config: { iceServers: ICE_SERVERS },
		});
		this.peer = peer;

		peer.on("open", () => {
			if (this.stopped || this.peer !== peer) {
				return;
			}
			const conn = peer.connect(this.targetId, { reliable: true });
			this.conn = conn;

			// An ICE pair that never completes fires nothing on its own —
			// hang up and redial instead of hanging silently.
			this.watchdog = setTimeout(() => {
				if (this.conn === conn && !conn.open) {
					conn.close();
				}
			}, CONNECT_TIMEOUT_MS);

			conn.on("open", () => {
				if (this.conn !== conn) {
					return;
				}
				clearTimeout(this.watchdog);
				this.delay = RECONNECT_MIN_MS;
				this.handlers.onOpen();
				this.flush();
			});
			conn.on("data", data => {
				this.handlers.onMessage(data as HostMessage);
			});
			const down = () => {
				if (this.conn === conn) {
					this.conn = undefined;
				}
				this.handlers.onDown();
				this.scheduleRedial();
			};
			conn.on("close", down);
			conn.on("error", down);
		});

		peer.on("error", (error: Error & { type?: string }) => {
			if (this.stopped || this.peer !== peer) {
				return;
			}
			if (error.type === "peer-unavailable") {
				// the panel is closed — its id lives on the broker only while
				// the page is open; keep dialing until it returns
				this.scheduleRedial();
				return;
			}
			// broker/network trouble — recycle the whole peer
			peer.destroy();
			if (this.peer === peer) {
				this.peer = undefined;
			}
			this.scheduleRedial();
		});
	}

	private scheduleRedial(): void {
		if (this.stopped || this.timer !== undefined) {
			return;
		}
		const jitter = Math.random() * this.delay * 0.3;
		this.timer = setTimeout(() => {
			this.timer = undefined;
			this.dial();
		}, this.delay + jitter);
		this.delay = Math.min(this.delay * 2, RECONNECT_MAX_MS);
	}

	private flush(): void {
		if (!this.isOpen() || this.queue.length === 0) {
			return;
		}
		const messages = this.queue.splice(0);
		for (const message of messages) {
			// peerjs send() may return a promise for chunked payloads — the
			// queue is the retry mechanism, the channel errors redial.
			void this.conn?.send(message);
		}
	}
}
