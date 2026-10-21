import { expect, test } from "vitest";
import type { ClientInfo } from "../shared/protocol.ts";
import { DevtoolsStore } from "./store.ts";

const client = (overrides: Partial<ClientInfo> = {}): ClientInfo => ({
	clientId: "c1",
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

test("pruneClients drops clients past the TTL", () => {
	const store = new DevtoolsStore();
	store.touchClient(client({ clientId: "fresh", lastSeenAt: 10_000 }));
	store.touchClient(client({ clientId: "stale", lastSeenAt: 0, connectedAt: 0 }));

	const dropped = store.pruneClients(20_000);
	expect(dropped.map(c => c.clientId)).toEqual(["stale"]);
	expect(store.listClients().map(c => c.clientId)).toEqual(["fresh"]);
});

test("execute round-trip settles via report and rejects late arrivals", async () => {
	const store = new DevtoolsStore();
	store.touchClient(client());
	store.beginExec(); // execId 1 — let it time out silently below? no: settle it
	const first = store.beginExec(); // execId 2

	expect(store.settleExec({ execId: 2, clientId: "c1", ok: true, payload: 42 })).toBe(true);
	await expect(first.promise).resolves.toEqual({ status: "ok", payload: 42 });

	// late duplicate is ignored
	expect(store.settleExec({ execId: 2, clientId: "c1", ok: false })).toBe(false);
});
