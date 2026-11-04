import { expect, test } from "vitest";
import type { ClientInfo } from "../shared/protocol.ts";
import { DevtoolsStore } from "./store.ts";

const client = (overrides: Partial<ClientInfo> = {}): ClientInfo => ({
	clientId: "c1",
	sessionId: "s1",
	connectedAt: 1_000,
	lastSeenAt: 1_000,
	ua: "test",
	url: "http://localhost:5173/",
	platform: "desktop-web",
	bridge: true,
	...overrides,
});

const event = (id: number, ts = 1_000) => ({
	id,
	ts,
	direction: "out" as const,
	kind: "send" as const,
	name: "VKWebAppInit",
});

test("pushEvents stamps seq and clientId for known clients only", () => {
	const store = new DevtoolsStore();
	store.touchClient(client());

	const stamped = store.pushEvents("c1", [event(1), event(2)]);
	expect(stamped.map(e => e.seq)).toEqual([1, 2]);
	if (stamped[0] !== undefined) {
		expect(stamped[0].clientId).toBe("c1");
	}

	expect(store.pushEvents("unknown", [event(3)])).toEqual([]);
});

test("a new session for a known client purges its previous history", () => {
	const store = new DevtoolsStore();
	store.touchClient(client({ sessionId: "s1" }));
	store.pushEvents("c1", [event(1), event(2)]);

	// same page reloads: fresh sessionId, same clientId
	store.touchClient(client({ sessionId: "s2", connectedAt: 2_000, lastSeenAt: 2_000 }));
	store.purgeEvents("c1");

	expect(store.snapshotEvents()).toEqual([]);
	expect(store.getClient("c1")?.sessionId).toBe("s2");
});

test("ring buffer keeps the last 500 events", () => {
	const store = new DevtoolsStore();
	store.touchClient(client());
	store.pushEvents(
		"c1",
		Array.from({ length: 600 }, (_, i) => event(i + 1)),
	);
	const snapshot = store.snapshotEvents();
	expect(snapshot).toHaveLength(500);
	expect(snapshot.at(-1)?.id).toBe(600);
	expect(snapshot.at(-1)?.seq).toBe(600);
});

test("clients past the heartbeat TTL flip offline but stay registered", () => {
	const store = new DevtoolsStore();
	store.touchClient(client({ clientId: "fresh", lastSeenAt: 10_000 }));
	store.touchClient(client({ clientId: "stale", lastSeenAt: 0, connectedAt: 0 }));

	const stale = store.listClients(20_000).find(c => c.clientId === "stale");
	const fresh = store.listClients(20_000).find(c => c.clientId === "fresh");
	expect(stale?.online).toBe(false);
	expect(fresh?.online).toBe(true);
});

test("heartbeats keep connectedAt stable, a new session re-anchors it", () => {
	const store = new DevtoolsStore();
	store.touchClient(client({ connectedAt: 1_000 }));
	// a collector bug that stamps fresh connectedAt per heartbeat must not
	// churn the registry order
	store.touchClient(client({ connectedAt: 9_000, lastSeenAt: 9_000 }));
	expect(store.getClient("c1")?.connectedAt).toBe(1_000);
	// a genuine page reload (new sessionId) starts a new connection
	store.touchClient(client({ sessionId: "s2", connectedAt: 9_000, lastSeenAt: 10_000 }));
	expect(store.getClient("c1")?.connectedAt).toBe(9_000);
});

test("the registry caps at 24 entries, dropping oldest offline first", () => {
	const store = new DevtoolsStore();
	for (let i = 0; i < 30; i++) {
		store.touchClient(client({ clientId: `c${i}`, connectedAt: i, lastSeenAt: i }));
	}

	const list = store.listClients(1_000_000);
	expect(list).toHaveLength(24);
	expect(store.getClient("c0")).toBeUndefined();
	expect(store.getClient("c6")).toBeDefined();
});

test("deleteClients removes offline entries, skips live and unknown ones", () => {
	const store = new DevtoolsStore();
	store.touchClient(client({ clientId: "live", lastSeenAt: 10_000 }));
	store.touchClient(client({ clientId: "stale", lastSeenAt: 0, connectedAt: 0 }));

	// now=20_000: live is inside the TTL, stale is past it
	expect(store.deleteClients(["live", "stale", "ghost"], 20_000)).toEqual(["stale"]);
	expect(store.getClient("stale")).toBeUndefined();
	expect(store.getClient("live")).toBeDefined();
	expect(store.getClient("ghost")).toBeUndefined();

	// registry hygiene only: the ledger keeps its history
	store.pushEvents("live", [event(1)]);
	expect(store.deleteClients(["live"], 20_000)).toEqual([]);
	expect(store.snapshotEvents()).toHaveLength(1);
});

test("execute round-trip settles via report and rejects late arrivals", async () => {
	const store = new DevtoolsStore();
	store.touchClient(client());
	store.beginExec(); // execId 1; let it time out silently below? no: settle it
	const first = store.beginExec(); // execId 2

	expect(store.settleExec({ execId: 2, clientId: "c1", ok: true, payload: 42 })).toBe(true);
	await expect(first.promise).resolves.toEqual({ status: "ok", payload: 42 });

	// late duplicate is ignored
	expect(store.settleExec({ execId: 2, clientId: "c1", ok: false })).toBe(false);
});

test("an owned exec settles only from its owning channel", async () => {
	const store = new DevtoolsStore();
	store.touchClient(client());
	const ownerA = { tag: "a" };
	const ownerB = { tag: "b" };
	const execA = store.beginExec(ownerA);
	const execNoOwner = store.beginExec();

	// a different connection's report is a forgery attempt; it drops
	expect(
		store.settleExec(
			{ execId: execA.execId, clientId: "c1", ok: true, payload: "forged" },
			ownerB,
		),
	).toBe(false);
	// the owning connection settles it
	expect(
		store.settleExec({ execId: execA.execId, clientId: "c1", ok: true, payload: 42 }, ownerA),
	).toBe(true);
	await expect(execA.promise).resolves.toEqual({ status: "ok", payload: 42 });

	// owner-less execs (legacy callers) keep the old behavior
	expect(
		store.settleExec({ execId: execNoOwner.execId, clientId: "c1", ok: true, payload: 1 }),
	).toBe(true);
	await expect(execNoOwner.promise).resolves.toEqual({ status: "ok", payload: 1 });
});

test("the ring budget is bytes as well as count", () => {
	const store = new DevtoolsStore();
	store.touchClient(client());
	const blob = "x".repeat(1024 * 1024);
	// 3 events x 1 MiB: far under the 500-event count cap, past nothing
	// byte-wise individually, but the budget trims the OLDEST once the
	// total crosses RING_BYTES (8 MiB): 9 pushes of 3 MiB keep only the
	// newest ~8.
	for (let round = 0; round < 9; round++) {
		store.pushEvents("c1", [
			{
				id: round,
				ts: 1_000,
				direction: "out",
				kind: "send",
				name: `n${round}`,
				payload: { blob },
			},
		]);
	}
	const snapshot = store.snapshotEvents();
	expect(snapshot.length).toBeLessThan(9); // byte budget evicted the oldest
	expect(snapshot.at(-1)?.name).toBe("n8"); // newest survives
});

test("the registry refuses new entries at the cap even when every entry is online", () => {
	const store = new DevtoolsStore();
	const now = Date.now(); // real clock: every entry below is ONLINE
	for (let i = 0; i < 24; i++) {
		store.touchClient(client({ clientId: `c${i}`, lastSeenAt: now }));
	}
	// all online, yet the 25th distinct id must not insert
	expect(store.touchClient(client({ clientId: "c25", lastSeenAt: now }))).toBe(false);
	expect(store.getClient("c25")).toBeUndefined();
	// heartbeats of existing entries keep working
	expect(store.touchClient(client({ clientId: "c0", lastSeenAt: now + 1 }))).toBe(true);
});
