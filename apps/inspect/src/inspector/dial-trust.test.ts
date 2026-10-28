import { describe, expect, it, vi } from "vitest";
import type { InspectorMessage } from "../shared/protocol.ts";
import { DialTrust } from "./dial-trust.ts";

/**
 * The verification race: a proof must admit only the connection it was
 * challenged on. If the channel dies (or a new one opens) while the
 * async verify is in flight, the continuation must NOT mark the NEW
 * channel verified and flush the credential backlog to it.
 */

const { verifyNonce } = vi.hoisted(() => ({
	verifyNonce: vi.fn<() => Promise<boolean>>(),
}));

vi.mock("../shared/signing.ts", () => ({ randomNonce: () => "n".repeat(43), verifyNonce }));

const KEY = "a".repeat(122);

function wire() {
	const sent: InspectorMessage[] = [];
	let verified = 0;
	let dropped = 0;
	const link = new DialTrust(KEY, {
		send: message => sent.push(message),
		isOpen: () => true,
		drop: () => {
			dropped++;
		},
		onVerified: () => {
			verified++;
		},
		onExecute: () => {},
	});
	return { link, sent, verifiedCount: () => verified, droppedCount: () => dropped };
}

const proof = (nonce: string) => ({
	v: 1 as const,
	t: "challenge-proof" as const,
	nonce,
	sig: "x",
});

describe("DialTrust verification race", () => {
	it("a proof for a dead channel does not admit the new one", async () => {
		const { link, sent, verifiedCount } = wire();

		link.channelOpened(); // epoch 1, challenge queued
		expect(sent.some(m => m.t === "challenge")).toBe(true);

		let resolveVerify: (ok: boolean) => void = () => {};
		verifyNonce.mockImplementation(
			() => new Promise<boolean>(resolve => (resolveVerify = resolve)),
		);

		link.onMessage(proof("n".repeat(43))); // verify in flight...
		// ...the channel dies and a new one opens before the crypto lands
		link.channelClosed();
		link.channelOpened();
		resolveVerify(true);
		await Promise.resolve();
		await Promise.resolve();

		// the new channel was never challenged-and-proven: no admission
		expect(verifiedCount()).toBe(0);
		expect(link.isVerified()).toBe(false);
	});

	it("a proof on a quiet channel still admits normally", async () => {
		const { link, verifiedCount } = wire();

		link.channelOpened();
		verifyNonce.mockResolvedValue(true);
		link.onMessage(proof("n".repeat(43)));
		await Promise.resolve();
		await Promise.resolve();

		expect(verifiedCount()).toBe(1);
		expect(link.isVerified()).toBe(true);
	});
});
