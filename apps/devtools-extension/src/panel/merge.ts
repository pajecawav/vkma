import type { WireEvent } from "@vkma.dev/protocol";

/**
 * Merges per-tab event feeds into one timeline. Host-side seq numbers are
 * per-tab and collide across tabs, so the merger derives a STABLE global
 * seq per (clientId, hostSeq), stable across re-merges because the
 * Timeline's clear/pause anchors are seq comparisons, and orders the
 * result by wire timestamp (the only globally comparable clock).
 */
export class MergedTimeline {
	private seqByKey = new Map<string, number>();
	private nextSeq = 0;

	public merge(feeds: Iterable<{ events: Iterable<WireEvent> }>): WireEvent[] {
		const all: WireEvent[] = [];
		for (const feed of feeds) {
			for (const event of feed.events) {
				all.push(event);
			}
		}
		all.sort(
			(a, b) =>
				a.ts - b.ts ||
				a.seq - b.seq ||
				(a.clientId < b.clientId ? -1 : a.clientId > b.clientId ? 1 : 0),
		);
		// The memo is rebuilt from the merge output: surviving keys keep
		// their seq (the Timeline's clear/pause anchors stay stable), while
		// seqs of events that left the feeds (host reloads mint fresh client
		// ids) are evicted, since the memo would otherwise grow for the
		// whole lifetime of the panel page.
		const live = new Map<string, number>();
		const merged = all.map(event => {
			const key = `${event.clientId}:${event.seq}`;
			let seq = live.get(key) ?? this.seqByKey.get(key);
			if (seq === undefined) {
				seq = ++this.nextSeq;
			}
			live.set(key, seq);
			// a COPY: mutating the host's stored event would corrupt its
			// identity on the next merge
			return Object.assign({}, event, { seq });
		});
		this.seqByKey = live;
		return merged;
	}
}
