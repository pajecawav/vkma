import type { ClientInfo } from "@vkma.dev/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InspectHost, type HostChannel, type ApprovalRequest } from "./host.ts";

/**
 * The host's hello/gate/exec contract, driven through fake channels —
 * exactly what the PeerJS layer feeds it in production.
 */

class FakeChannel implements HostChannel {
	public sent: import("../shared/protocol.ts").HostMessage[] = [];
	public closed = false;

	public send(message: import("../shared/protocol.ts").HostMessage): void {
		this.sent.push(message);
	}

	public close(): void {
		this.closed = true;
	}
}

const info = (clientId: string, overrides: Partial<ClientInfo> = {}): ClientInfo => ({
	clientId,
	sessionId: "s1",
	connectedAt: 1_000,
	lastSeenAt: Date.now(),
	ua: "test",
	url: "https://app.example.com/?vk_app_id=42",
	platform: "android",
	bridge: false,
	appId: "42",
	launchParams: { vk_app_id: "42" },
	...overrides,
});

const hello = (client: ClientInfo) => ({ v: 1 as const, t: "hello" as const, info: client });
const events = (clientId: string, rows: unknown[]) => ({
	v: 1 as const,
	t: "events" as const,
	clientId,
	events: rows,
});
const tapSend = (id: number, name = "VKWebAppInit") => ({
	id,
	ts: id,
	direction: "out" as const,
	kind: "send" as const,
	name,
});

afterEach(() => {
	localStorage.clear();
	vi.useRealTimers();
});

describe("InspectHost", () => {
	it("registers a client on hello and broadcasts the registry", () => {
		const host = new InspectHost();
		host.setGateEnabled(false);
		const seen: unknown[] = [];
		host.clientsHub.subscribe(next => seen.push(next));

		const channel = new FakeChannel();
		host.addChannel(channel);
		host.handleMessage(channel, hello(info("c1")));

		expect(host.store.listClients().map(c => c.clientId)).toEqual(["c1"]);
		expect(seen).toHaveLength(1);
	});

	it("drops events from a client that never said hello", () => {
		const host = new InspectHost();
		host.setGateEnabled(false);
		const channel = new FakeChannel();
		host.addChannel(channel);
		host.handleMessage(channel, events("ghost", [tapSend(1)]));
		expect(host.store.snapshotEvents()).toHaveLength(0);
	});

	it("stamps accepted events with seq/runId and batches them out", () => {
		const host = new InspectHost();
		host.setGateEnabled(false);
		const batches: unknown[][] = [];
		host.timelineHub.subscribe(batch => batches.push(batch));

		const channel = new FakeChannel();
		host.addChannel(channel);
		host.handleMessage(channel, hello(info("c1")));
		host.handleMessage(channel, events("c1", [tapSend(1), tapSend(2, "vk-connect")]));
		host.timelineHub.flush();

		expect(batches).toHaveLength(1);
		const rows = batches[0] as { seq: number; name: string; runId: string; clientId: string }[];
		expect(rows.map(r => r.seq)).toEqual([1]); // vk-connect chatter filtered
		expect(rows[0].name).toBe("VKWebAppInit");
		expect(rows[0].runId).toBe(host.store.runId);
		expect(rows[0].clientId).toBe("c1");
	});

	it("a session change purges history and broadcasts the reset", () => {
		const host = new InspectHost();
		host.setGateEnabled(false);
		const resets: { clientId: string }[] = [];
		host.sessionResetHub.subscribe(next => resets.push(next));

		const channel = new FakeChannel();
		host.addChannel(channel);
		host.handleMessage(channel, hello(info("c1", { sessionId: "s1" })));
		host.handleMessage(channel, events("c1", [tapSend(1)]));
		expect(host.store.snapshotEvents()).toHaveLength(1);

		host.handleMessage(channel, hello(info("c1", { sessionId: "s2" })));
		expect(resets).toEqual([{ clientId: "c1" }]);
		expect(host.store.snapshotEvents()).toHaveLength(0);
	});

	it("a spy→direct capture flip purges the spy-era reconstruction", () => {
		const host = new InspectHost();
		host.setGateEnabled(false);
		const channel = new FakeChannel();
		host.addChannel(channel);
		host.handleMessage(channel, hello(info("c1", { bridge: false })));
		host.handleMessage(channel, events("c1", [tapSend(1)]));
		expect(host.store.snapshotEvents()).toHaveLength(1);

		host.handleMessage(channel, hello(info("c1", { bridge: true })));
		expect(host.store.snapshotEvents()).toHaveLength(0);
	});

	it("drops malformed input silently", () => {
		const host = new InspectHost();
		host.setGateEnabled(false);
		const channel = new FakeChannel();
		host.addChannel(channel);
		expect(() => {
			host.handleMessage(channel, { v: 9, t: "hello" });
			host.handleMessage(channel, "junk");
			host.handleMessage(channel, null);
		}).not.toThrow();
		expect(host.store.listClients()).toHaveLength(0);
	});

	// --- the gate ---------------------------------------------------------------

	it("parks an unknown client until approved, then replays the buffer", () => {
		const host = new InspectHost(); // gate ON by default
		const approvals: ApprovalRequest[][] = [];
		host.approvalsHub.subscribe(next => approvals.push(next));

		const channel = new FakeChannel();
		host.addChannel(channel);
		host.handleMessage(channel, hello(info("c1")));
		host.handleMessage(channel, events("c1", [tapSend(1)]));

		expect(host.store.listClients()).toHaveLength(0); // parked, not registered
		expect(approvals.at(-1)?.[0]?.info.appId).toBe("42");

		host.approve("c1", false);
		expect(approvals.at(-1)).toHaveLength(0);
		expect(host.store.listClients().map(c => c.clientId)).toEqual(["c1"]);
		host.timelineHub.flush();
		expect(host.store.snapshotEvents()).toHaveLength(1); // buffered replay
	});

	it("allow-once admits the connection, not the client: a new connection re-parks", () => {
		const host = new InspectHost();
		const channel = new FakeChannel();
		host.addChannel(channel);
		host.handleMessage(channel, hello(info("c1")));
		host.approve("c1", false);
		expect(host.pendingApprovals()).toHaveLength(0);

		// heartbeats on the live connection flow through
		host.handleMessage(channel, hello(info("c1")));
		expect(host.pendingApprovals()).toHaveLength(0);
		expect(host.store.listClients().map(c => c.clientId)).toEqual(["c1"]);

		// a fresh connection (page reload with a minted client id — or the
		// same id after the panel forgot nothing) faces the gate again
		const second = new FakeChannel();
		host.addChannel(second);
		host.handleMessage(second, hello(info("c2")));
		expect(host.pendingApprovals().map(pending => pending.clientId)).toEqual(["c2"]);
	});

	it("an always-allow approval survives a panel reload", () => {
		const host = new InspectHost();
		const channel = new FakeChannel();
		host.addChannel(channel);
		host.handleMessage(channel, hello(info("c1")));
		host.approve("c1", true);

		const next = new InspectHost(); // fresh page load, same storage
		next.addChannel(channel);
		next.handleMessage(channel, hello(info("c1")));
		expect(next.store.listClients().map(c => c.clientId)).toEqual(["c1"]);
	});

	it("a denied connection closes and stays silent when it returns", () => {
		const host = new InspectHost();
		const channel = new FakeChannel();
		host.addChannel(channel);
		host.handleMessage(channel, hello(info("c1")));
		host.deny("c1");

		expect(channel.closed).toBe(true);
		const second = new FakeChannel();
		host.addChannel(second);
		host.handleMessage(second, hello(info("c1")));
		expect(second.closed).toBe(true); // denial is remembered for this load
		expect(host.store.listClients()).toHaveLength(0);
	});

	it("turning the gate off lets parked connections in immediately", () => {
		const host = new InspectHost();
		const channel = new FakeChannel();
		host.addChannel(channel);
		host.handleMessage(channel, hello(info("c1")));
		expect(host.pendingApprovals()).toHaveLength(1);

		host.setGateEnabled(false);
		expect(host.pendingApprovals()).toHaveLength(0);
		expect(host.store.listClients().map(c => c.clientId)).toEqual(["c1"]);
	});

	// --- execute ------------------------------------------------------------------

	it("execute answers no-client for an unknown client", async () => {
		const host = new InspectHost();
		host.setGateEnabled(false);
		await expect(host.execute("ghost", "VKWebAppInit", {})).resolves.toEqual({
			status: "no-client",
			clientId: "ghost",
		});
	});

	it("execute routes to the owning channel and settles on exec-result", async () => {
		const host = new InspectHost();
		host.setGateEnabled(false);
		const channel = new FakeChannel();
		host.addChannel(channel);
		host.handleMessage(channel, hello(info("c1")));

		const promise = host.execute("c1", "VKWebAppGetUserInfo", { user_id: 1 });
		const request = channel.sent.find(m => m.t === "execute");
		expect(request).toMatchObject({
			t: "execute",
			clientId: "c1",
			name: "VKWebAppGetUserInfo",
		});

		host.handleMessage(channel, {
			v: 1,
			t: "exec-result",
			execId: (request as { execId: number }).execId,
			clientId: "c1",
			ok: true,
			payload: { response: [] },
		});
		await expect(promise).resolves.toEqual({ status: "ok", payload: { response: [] } });
	});

	it("deleteClients removes only offline clients", () => {
		const host = new InspectHost();
		host.setGateEnabled(false);
		const channel = new FakeChannel();
		host.addChannel(channel);
		const now = Date.now();
		host.handleMessage(channel, hello(info("online", { lastSeenAt: now })));
		host.handleMessage(channel, hello(info("stale", { lastSeenAt: now - 60_000 })));

		expect(host.deleteClients(["online", "stale"])).toEqual(["stale"]);
		expect(host.store.listClients().map(c => c.clientId)).toEqual(["online"]);
	});
});
