import { expect, test } from "vitest";
import type { WireEvent } from "../shared/protocol.ts";
import { EmbeddedSubscriptions, groupByClient } from "./subscriptions.ts";

test("bind upserts per session and scopeOf reads it back", () => {
	const subs = new EmbeddedSubscriptions();
	const meta = { id: 1 };
	expect(subs.scopeOf(meta)).toBeUndefined();
	subs.bind(meta, "client-a");
	expect(subs.scopeOf(meta)).toBe("client-a");
	subs.bind(meta, "client-b");
	expect(subs.scopeOf(meta)).toBe("client-b");
	expect(subs.has(meta)).toBe(true);
	expect(subs.has({ id: 2 })).toBe(false);
});

test("the cap evicts the oldest binding, refreshes keep their place", () => {
	const subs = new EmbeddedSubscriptions();
	const meta1 = { id: 1 };
	const meta2 = { id: 2 };
	const meta3 = { id: 3 };
	subs.bind(meta1, "client-a", 2);
	subs.bind(meta2, "client-b", 2);
	// rebinding an existing session must not evict it as "oldest"
	subs.bind(meta1, "client-a2", 2);
	subs.bind(meta3, "client-c", 2);
	expect(subs.scopeOf(meta1)).toBe("client-a2");
	expect(subs.scopeOf(meta2)).toBeUndefined();
	expect(subs.scopeOf(meta3)).toBe("client-c");
});

test("groupByClient splits a mixed-client batch", () => {
	const event = (clientId: string, seq: number): WireEvent => ({
		id: seq,
		ts: seq,
		clientId,
		direction: "out",
		kind: "send",
		name: "VKWebAppGetUserInfo",
		seq,
	});
	const groups = groupByClient([event("a", 1), event("b", 2), event("a", 3)]);
	expect([...groups.keys()].toSorted()).toEqual(["a", "b"]);
	expect(groups.get("a")?.map(e => e.seq)).toEqual([1, 3]);
	expect(groups.get("b")?.map(e => e.seq)).toEqual([2]);
});
