/**
 * Server-side scoping for embedded panels: a session that subscribed to a
 * single client id only ever receives that client's traffic. Sessions are
 * keyed by their RPC session meta object — the same identity the devframe
 * broadcast `filter` compares (`client.$meta === session.meta`) — so a dead
 * session's binding simply never matches a live filter and stays inert.
 */
export class EmbeddedSubscriptions {
	private readonly subs = new Map<unknown, string>();

	/** Upserts the binding; evicts the oldest binding when outgrowing the cap. */
	public bind(meta: unknown, clientId: string, cap = 32): void {
		// delete-then-set: Map keeps a re-set key at its old position, which
		// would let a just-refreshed binding be evicted as the oldest.
		this.subs.delete(meta);
		if (this.subs.size >= cap) {
			const oldest = this.subs.keys().next();
			if (!oldest.done) {
				this.subs.delete(oldest.value);
			}
		}
		this.subs.set(meta, clientId);
	}

	public scopeOf(meta: unknown): string | undefined {
		return this.subs.get(meta);
	}

	public has(meta: unknown): boolean {
		return this.subs.has(meta);
	}

	public scoped(): IterableIterator<[unknown, string]> {
		return this.subs.entries();
	}
}

/** Splits a mixed-client batch into per-client groups. */
export function groupByClient<T extends { clientId: string }>(items: T[]): Map<string, T[]> {
	const groups = new Map<string, T[]>();
	for (const item of items) {
		const group = groups.get(item.clientId);
		if (group === undefined) {
			groups.set(item.clientId, [item]);
		} else {
			group.push(item);
		}
	}
	return groups;
}
