import type { WireEvent } from "@vkma.dev/protocol";

const MAX_EVENTS = 500;
/** Byte budget alongside the count cap — the mirror of the store's ring:
 * a count-only slice retains multi-megabyte payloads in React state. */
const MAX_BYTES = 8 * 1024 * 1024;

const approxBytes = (event: WireEvent): number => {
	const payload = event.payload;
	const payloadSize =
		typeof payload === "string"
			? payload.length
			: (JSON.stringify(payload ?? null)?.length ?? 0);
	return event.name.length + payloadSize;
};

/**
 * Absorb timeline batches: dedupe by (runId, seq). The store dies with
 * the panel page (seq restarts on reload), so a batch from an unknown
 * run resets the absorb state and other runs' events are dropped as
 * ghosts. (The extension panel's verbatim algorithm, plus the byte
 * budget the store's ring also enforces.)
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
	const newest = [...merged.values()].toSorted((a, b) => a.seq - b.seq).slice(-MAX_EVENTS);
	let total = newest.reduce((sum, event) => sum + approxBytes(event), 0);
	while (total > MAX_BYTES && newest.length > 1) {
		const dropped = newest.shift();
		if (dropped === undefined) {
			break;
		}
		total -= approxBytes(dropped);
	}
	return newest;
}
