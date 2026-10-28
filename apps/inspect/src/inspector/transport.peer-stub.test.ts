import { describe, expect, it, vi } from "vitest";
import { signNonce } from "../shared/signing.ts";
import { DialTrust } from "./dial-trust.ts";
import { InspectorTransport } from "./transport.ts";

/**
 * The dial-direction trust boundary, inspector half (audit record
 * `dial.no-answerer-auth`, now FIXED): the answering peer must sign a
 * fresh challenge with the panel's key before ANY credential moves —
 * no hello, no backlog, no execute acceptance otherwise. The broker
 * hands a stopped peer id to whoever registers it first (probed
 * against the public cloud: re-grant within ~300 ms, the registration
 * token proves nothing), so the signature is the only accepted proof.
 *
 * The peerjs module is stubbed: the "answering peer" below is
 * attacker- or panel-controlled, with no signaling involved at all.
 */

const { FakePeer, peers } = vi.hoisted(() => {
	type Listener = (value: unknown) => void;

	class FakeDataConnection {
		public open = false;
		public closed = false;
		public sent: unknown[] = [];
		readonly #listeners = new Map<string, Set<Listener>>();

		public on(event: string, listener: Listener): void {
			const set = this.#listeners.get(event) ?? new Set<Listener>();
			set.add(listener);
			this.#listeners.set(event, set);
		}

		public emit(event: string, value: unknown): void {
			for (const listener of this.#listeners.get(event) ?? []) {
				listener(value);
			}
		}

		public send(message: unknown): Promise<void> {
			this.sent.push(message);
			return Promise.resolve();
		}

		public close(): void {
			this.open = false;
			this.closed = true;
			this.emit("close", undefined);
		}

		/** The answering peer "completes the handshake". */
		public accept(): void {
			this.open = true;
			this.emit("open", undefined);
		}
	}

	const peers: FakePeer[] = [];

	class FakePeer {
		public destroyed = false;
		public connectTarget: string | undefined;
		readonly #listeners = new Map<string, Set<Listener>>();

		public constructor(public readonly id?: string) {
			peers.push(this);
		}

		public on(event: string, listener: Listener): void {
			const set = this.#listeners.get(event) ?? new Set<Listener>();
			set.add(listener);
			this.#listeners.set(event, set);
		}

		public emit(event: string, value: unknown): void {
			for (const listener of this.#listeners.get(event) ?? []) {
				listener(value);
			}
		}

		public connect(target: string): FakeDataConnection {
			this.connectTarget = target;
			return new FakeDataConnection();
		}

		public destroy(): void {
			this.destroyed = true;
		}
	}

	return { FakePeer, peers };
});

vi.mock("peerjs", () => ({ default: FakePeer }));

/** The attacker-side shape of the DataConnection the transport holds. */
interface StubConn {
	sent: unknown[];
	open: boolean;
	closed: boolean;
	accept(): void;
	emit(event: string, value: unknown): void;
}

const byType = (sent: unknown[], t: string) =>
	sent.filter(message => (message as { t?: string }).t === t) as Array<Record<string, unknown>>;

/** The collector's wiring (index.ts) over the transport + gate. */
function wireInspector(verifyKey: string | undefined) {
	const transport = new InspectorTransport("vkma-inspect-target", {
		onOpen: () => link.channelOpened(),
		onMessage: message => link.onMessage(message),
		onDown: () => link.channelClosed(),
	});
	const inbound: unknown[] = [];
	let verified = false;
	const link = new DialTrust(verifyKey, {
		send: message => transport.send(message),
		isOpen: () => transport.isOpen(),
		drop: () => transport.drop(),
		onVerified: () => {
			verified = true;
			link.enqueue({
				v: 1,
				t: "hello",
				info: {
					clientId: "c-phone",
					sessionId: "s1",
					connectedAt: 1,
					lastSeenAt: 1,
					ua: "ua",
					url: "https://app.example.com/?sign=SECRET",
					platform: "android",
					bridge: false,
					launchParams: { sign: "SECRET", vk_app_id: "42" },
				},
			});
			link.enqueue({
				v: 1,
				t: "events",
				clientId: "c-phone",
				events: [{ id: 1, ts: 1, direction: "out", kind: "send", name: "VKWebAppInit" }],
			});
		},
		onExecute: request => {
			inbound.push(request);
		},
	});
	const conn = () => (transport as unknown as { conn?: StubConn }).conn!;
	return { transport, link, inbound, conn, isVerified: () => verified };
}

describe("InspectorTransport dial trust (stubbed signaling)", () => {
	it("a silent answerer gets a challenge and NOTHING credential-bearing", () => {
		const app = wireInspector("a".repeat(122));
		app.transport.start();
		peers.at(-1)!.emit("open", undefined);
		const conn = app.conn();
		conn.accept();

		// the challenge went out; no hello, no backlog — the answerer
		// proved nothing yet
		expect(byType(conn.sent, "challenge")).toHaveLength(1);
		expect(byType(conn.sent, "hello")).toHaveLength(0);
		expect(byType(conn.sent, "events")).toHaveLength(0);
		expect(app.isVerified()).toBe(false);

		// its execute is not honored either — unverified drop
		conn.emit("data", {
			v: 1,
			t: "execute",
			execId: 1,
			clientId: "c-phone",
			name: "VKWebAppGetAuthToken",
		});
		expect(app.inbound).toEqual([]);
		app.transport.stop();
	});

	it("a forged proof is dropped — the squatter never sees credentials", async () => {
		const app = wireInspector("a".repeat(122));
		app.transport.start();
		peers.at(-1)!.emit("open", undefined);
		const conn = app.conn();
		conn.accept();

		const challenge = byType(conn.sent, "challenge")[0]!;
		conn.emit("data", {
			v: 1,
			t: "challenge-proof",
			nonce: challenge.nonce,
			sig: "forged-by-the-squatter",
		});
		// the verify path is real crypto: importKey + subtle.verify take
		// more than a microtask
		await new Promise(resolve => setTimeout(resolve, 20));

		// the connection is closed (drop → redial), nothing shipped
		expect(conn.closed).toBe(true);
		expect(byType(conn.sent, "hello")).toHaveLength(0);
		app.transport.stop();
	});

	it("the honest panel signs — only then do credentials flow", async () => {
		const key = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
			"sign",
			"verify",
		]);
		const spki = await crypto.subtle.exportKey("spki", key.publicKey);
		const publicKey = btoa(String.fromCharCode(...new Uint8Array(spki)))
			.replaceAll("+", "-")
			.replaceAll("/", "_")
			.replaceAll("=", "");
		const app = wireInspector(publicKey);
		app.transport.start();
		peers.at(-1)!.emit("open", undefined);
		const conn = app.conn();
		conn.accept();

		const challenge = byType(conn.sent, "challenge")[0]!;
		conn.emit("data", {
			v: 1,
			t: "challenge-proof",
			nonce: challenge.nonce,
			sig: await signNonce(key.privateKey, challenge.nonce as string),
		});
		await new Promise(resolve => setTimeout(resolve, 20));

		// NOW the hello (launch params included) and the backlog ship
		const hello = byType(conn.sent, "hello")[0] as
			| { info: { launchParams: Record<string, string>; clientId: string } }
			| undefined;
		expect(hello).toBeDefined();
		expect(hello!.info.launchParams).toEqual({ sign: "SECRET", vk_app_id: "42" });
		expect(byType(conn.sent, "events")).toHaveLength(1);
		expect(app.isVerified()).toBe(true);

		// and the verified panel's execute reaches the collector
		conn.emit("data", {
			v: 1,
			t: "execute",
			execId: 1,
			clientId: hello!.info.clientId,
			name: "VKWebAppGetAuthToken",
			params: { scope: "friends" },
		});
		expect(app.inbound).toEqual([
			{
				v: 1,
				t: "execute",
				execId: 1,
				clientId: "c-phone",
				name: "VKWebAppGetAuthToken",
				params: { scope: "friends" },
			},
		]);
		app.transport.stop();
	});

	it("a stale snippet without `k=` ships nothing at all", () => {
		const app = wireInspector(undefined);
		app.transport.start();
		peers.at(-1)!.emit("open", undefined);
		const conn = app.conn();
		conn.accept();
		expect(conn.sent).toHaveLength(0);
		app.transport.stop();
	});
});
