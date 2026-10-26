import type { WireEvent } from "@vkma.dev/protocol";

const MAX_EVENTS = 500;

/**
 * Absorb timeline batches: dedupe by (runId, seq). The store dies with
 * the panel page (seq restarts on reload), so a batch from an unknown
 * run resets the absorb state and other runs' events are dropped as
 * ghosts. (The extension panel's verbatim algorithm.)
 */
export function absorbEvents(prev: WireEvent[], incoming: WireEvent[]): WireEvent[] {
	const last = incoming.at(-1);
	if (last === undefined) {
		return prev;
	}
	const runId = last.runId;
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
