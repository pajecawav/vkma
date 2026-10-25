import type { WireEvent } from "@vkma.dev/protocol";

const MAX_EVENTS = 500;

/**
 * Absorb timeline batches: dedupe by (runId, seq). The collecting side's
 * store dies with its page (extension host) or dev server — after a
 * restart the resurrected subscription (werpc retries
 * `subscription.start` until acked) restarts `seq` from zero, so a batch
 * from an unknown run resets the absorb state and other runs' events are
 * dropped as ghosts (they used to resurface mid-list and never leave).
 */
export function absorbEvents(prev: WireEvent[], incoming: WireEvent[]): WireEvent[] {
	const runId = incoming.at(-1)?.runId;
	if (runId === undefined) {
		return prev;
	}
	const merged = new Map(
		prev
			.filter(event => event.runId === runId)
			.map(event => [`${event.runId}:${event.seq}`, event]),
	);
	for (const event of incoming) {
		merged.set(`${event.runId}:${event.seq}`, event);
	}
	return [...merged.values()].toSorted((a, b) => a.seq - b.seq).slice(-MAX_EVENTS);
}
