import type { WireEvent } from "@vkma.dev/protocol";

/**
 * Merges per-tab event feeds into one timeline. Host-side seq numbers are
 * per-tab and collide across tabs, so the merger derives a STABLE global
 * seq per (clientId, hostSeq) — stable across re-merges, because the
 * Timeline's clear/pause anchors are seq comparisons — and orders the
 * result by wire timestamp (the only globally comparable clock).
 */
export class MergedTimeline {
	private readonly seqByKey = new Map<string, number>();
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
		return all.map(event => {
			const key = `${event.clientId}:${event.seq}`;
			let seq = this.seqByKey.get(key);
			if (seq === undefined) {
				seq = ++this.nextSeq;
				this.seqByKey.set(key, seq);
			}
			// a COPY — mutating the host's stored event would corrupt its
			// identity on the next merge
			return Object.assign({}, event, { seq });
		});
	}
}
