/**
 * Request↔response pairing for the spy captures. vk-bridge (and
 * @vkma.dev/bridge) inject the `request_id` into params BEFORE the
 * transport fires, so an intercepted outgoing call carries it — the only
 * join key between a synthesized `send` row and the raw incoming event
 * that answers it.
 */

/** Bound on pending pairings: a page spamming unique request_ids that
 * never get answers must not grow the map forever (drop-oldest). */
const MAX_PENDING = 1_000;

export class RequestJoiner {
	private readonly sends = new Map<string, number>();

	/** Remember which synthesized send id a wire request_id belongs to. */
	public record(requestId: string, sendId: number): void {
		if (this.sends.size >= MAX_PENDING) {
			const oldest = this.sends.keys().next().value;
			if (oldest !== undefined) {
				this.sends.delete(oldest);
			}
		}
		this.sends.set(requestId, sendId);
	}

	/** Take the send id paired with a request_id (one-shot). */
	public take(requestId: string): number | undefined {
		const sendId = this.sends.get(requestId);
		if (sendId !== undefined) {
			this.sends.delete(requestId);
		}
		return sendId;
	}
}
