import { describe, expect, it, vi } from "vitest";
import { InspectorTransport } from "./transport.ts";

/**
 * The dial-direction trust boundary, inspector half (audit record
 * `dial.no-answerer-auth`): whoever completes the DataChannel handshake
 * receives the credential-bearing hello and the queued backlog, and its
 * `execute` messages are handed to the collector's onMessage — the
 * transport performs no verification of the answering peer because none
 * exists in the protocol (the peer id is the only capability, and the
 * broker's grant policy is server-side; see NEEDS-VALIDATION.md for the
 * owner's broker probe).
 *
 * The peerjs module is stubbed: the "answering peer" below is an
 * attacker-controlled fake with no signaling involvement at all.
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

		/** The attacker "completes the handshake". */
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
	accept(): void;
	emit(event: string, value: unknown): void;
}

const helloOf = (sent: unknown[]) =>
	sent.find(message => (message as { t?: string }).t === "hello") as
		| {
				t: "hello";
				info: { clientId: string; launchParams: Record<string, string>; url: string };
		  }
		| undefined;

describe("InspectorTransport dial trust (stubbed signaling)", () => {
	it("hands the credential-bearing hello and backlog to ANY peer that opens", () => {
		const inbound: unknown[] = [];
		const transport = new InspectorTransport("vkma-inspect-target", {
			onOpen: () => {
				// the collector's own wiring (index.ts): hello first, then
				// everything captured while disconnected
				transport.send({
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
				transport.send({
					v: 1,
					t: "events",
					clientId: "c-phone",
					events: [
						{ id: 1, ts: 1, direction: "out", kind: "send", name: "VKWebAppInit" },
					],
				});
			},
			onMessage: message => {
				inbound.push(message);
			},
		});

		// backlog queued while "disconnected"
		transport.start();
		expect(peers).toHaveLength(1);
		expect(peers[0]?.connectTarget).toBeUndefined(); // dial happens on open
		peers[0]!.emit("open", undefined); // broker assigns the anonymous id
		expect(peers[0]?.connectTarget).toBe("vkma-inspect-target");

		// the attacker's fake DataConnection "opens" — no signaling, no
		// identity, no challenge anywhere on this path
		const conn = (transport as unknown as { conn?: StubConn }).conn;
		expect(conn).toBeDefined();
		conn!.accept();

		const hello = helloOf(conn!.sent);
		expect(hello).toBeDefined();
		expect(hello!.info.launchParams).toEqual({ sign: "SECRET", vk_app_id: "42" });
		// the queued backlog flushed to the same attacker connection
		expect(conn!.sent.some((m: unknown) => (m as { t?: string }).t === "events")).toBe(true);

		// and the attacker's execute is handed straight to the collector —
		// the only gate is the clientId the hello itself just disclosed
		conn!.emit("data", {
			v: 1,
			t: "execute",
			execId: 1,
			clientId: hello!.info.clientId,
			name: "VKWebAppGetAuthToken",
			params: { scope: "friends" },
		});
		expect(inbound).toEqual([
			{
				v: 1,
				t: "execute",
				execId: 1,
				clientId: "c-phone",
				name: "VKWebAppGetAuthToken",
				params: { scope: "friends" },
			},
		]);

		transport.stop();
	});
});
