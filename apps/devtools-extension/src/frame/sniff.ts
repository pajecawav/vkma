import type { VkConnectEnvelope } from "@vkma.dev/protocol/schemas";
import { looksLikeVkConnect } from "@vkma.dev/protocol/schemas";

/** An app → host envelope as the frame it was posted INTO saw it. `ts`
 * is when that happened: the report travels, the timeline orders by it. */
export interface SniffedEnvelope {
	envelope: VkConnectEnvelope;
	/** The sender's origin, the browser's own fact: it names the client. */
	origin: string;
	ts: number;
}

/**
 * The listener of a frame an app posts to. vk-bridge's web transport
 * always targets `window.parent`, so the app's requests arrive in its
 * DIRECT parent, and the `message` event fires in every world of that
 * frame, the isolated one included. On vk.com that parent is the top
 * frame; on OK the game sits one level down, inside an adapter frame
 * that answers the game itself, and the top window never hears a thing.
 * So every frame but the top reports what its children post into it; the
 * top frame has the host script's own listener.
 *
 * The envelope is only pre-filtered here (the cheap shape check): the
 * host parses it in full at its trust boundary.
 */
/** What the listener reads off the `message` event: the three fields
 * below, whoever dispatches it. */
export type MessageLike = Pick<MessageEvent<unknown>, "source" | "data" | "origin">;

export function childEnvelopeListener(
	self: unknown,
	report: (sniffed: SniffedEnvelope) => void,
): (event: MessageLike) => void {
	return event => {
		// A frame's own posts (a page talking to itself) are not a
		// child's requests.
		if (event.source === self || !looksLikeVkConnect(event.data)) {
			return;
		}
		report({ envelope: event.data as VkConnectEnvelope, origin: event.origin, ts: Date.now() });
	};
}

/** Bounded: a chatty game must not grow a frame's memory while the host
 * is out of reach. */
const QUEUE_LIMIT = 100;

export interface SniffUplinkOptions {
	/** How long a failed delivery waits before it is tried again. */
	retryMs: number;
	/** Deliveries in a row that may fail before the frame stops reporting:
	 * the tab has no host (not a VK page). */
	maxFailures: number;
}

/**
 * Carries what a frame sniffed to the host, in order, across the gap
 * before the host is up: it injects at the top frame's document_end and
 * a game's first request (VKWebAppInit) tends to come earlier. A failed
 * delivery keeps its envelopes and is tried again; a tab that never
 * answers is given up on.
 */
export class SniffUplink {
	private readonly queue: SniffedEnvelope[] = [];
	private inFlight = false;
	/** A failed delivery's retry is pending: later pushes wait for it. */
	private waiting = false;
	private failures = 0;
	private done = false;
	private timer: ReturnType<typeof setTimeout> | undefined;

	public constructor(
		private readonly deliver: (batch: SniffedEnvelope[]) => Promise<void>,
		private readonly options: SniffUplinkOptions = { retryMs: 1_000, maxFailures: 10 },
	) {}

	public push(sniffed: SniffedEnvelope): void {
		if (this.done) {
			return;
		}
		this.queue.push(sniffed);
		this.trim();
		void this.flush();
	}

	/** Newest wins: when a frame's backlog outgrows its bound, the oldest
	 * finds are what go. */
	private trim(): void {
		if (this.queue.length > QUEUE_LIMIT) {
			this.queue.splice(0, this.queue.length - QUEUE_LIMIT);
		}
	}

	/** Reports no more and delivers nothing pending (the frame is going away). */
	public dispose(): void {
		clearTimeout(this.timer);
		this.done = true;
		this.queue.length = 0;
	}

	private async flush(): Promise<void> {
		if (this.inFlight || this.done || this.waiting || this.queue.length === 0) {
			return;
		}
		this.inFlight = true;
		const batch = this.queue.splice(0);
		let failed = false;
		try {
			await this.deliver(batch);
			this.failures = 0;
		} catch {
			failed = true;
			this.failures++;
			if (this.failures >= this.options.maxFailures) {
				this.done = true;
				this.queue.length = 0;
			} else {
				// still in order, ahead of what arrived meanwhile
				this.queue.unshift(...batch);
				this.trim();
				this.waiting = true;
				this.timer = setTimeout(() => {
					this.waiting = false;
					void this.flush();
				}, this.options.retryMs);
			}
		} finally {
			this.inFlight = false;
		}
		// What arrived while this batch was in flight follows right away.
		if (!failed) {
			void this.flush();
		}
	}
}
