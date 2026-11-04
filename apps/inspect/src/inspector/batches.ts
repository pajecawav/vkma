import type { TapEvent } from "@vkma.dev/protocol/schemas";
import { MAX_EVENTS } from "../shared/config.ts";
import { PROTOCOL_VERSION, type InspectEventsMessage } from "../shared/protocol.ts";

/**
 * The wire bound on one events batch is absolute (the host drops whole
 * batches over it, silently), so a flush must chunk. The first flush
 * after finalize otherwise ships the tap replay (up to 500 rows) plus
 * ten seconds of resolving-phase buffer in one message, and the host
 * would drop the WHOLE thing, hiding exactly the traffic an operator
 * needs to see.
 */
export function eventBatches(queue: TapEvent[], clientId: string): InspectEventsMessage[] {
	const batches: InspectEventsMessage[] = [];
	for (let start = 0; start < queue.length; start += MAX_EVENTS) {
		batches.push({
			v: PROTOCOL_VERSION,
			t: "events",
			clientId,
			events: queue.slice(start, start + MAX_EVENTS),
		});
	}
	return batches;
}
