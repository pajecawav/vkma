import { describe, expect, it } from "vitest";
import {
	loadOrCreateSigningKey,
	looksLikePublicKey,
	randomNonce,
	signNonce,
	verifyNonce,
} from "./signing.ts";

describe("signing (dial-direction trust)", () => {
	it("round-trips: the panel signs, the inspector verifies", async () => {
		const key = await loadOrCreateSigningKey();
		const nonce = randomNonce();
		const sig = await signNonce(key.privateKey, nonce);
		expect(await verifyNonce(key.publicKey, nonce, sig)).toBe(true);
	});

	it("a different key does not verify — the squatter's answer fails", async () => {
		const panel = await loadOrCreateSigningKey();
		const impostor = await crypto.subtle.generateKey(
			{ name: "ECDSA", namedCurve: "P-256" },
			true,
			["sign", "verify"],
		);
		const nonce = randomNonce();
		const sig = await signNonce(impostor.privateKey, nonce);
		expect(await verifyNonce(panel.publicKey, nonce, sig)).toBe(false);
	});

	it("a signed nonce does not verify against a different challenge (no replay)", async () => {
		const key = await loadOrCreateSigningKey();
		const sig = await signNonce(key.privateKey, randomNonce());
		expect(await verifyNonce(key.publicKey, randomNonce(), sig)).toBe(false);
	});

	it("garbage input drops to false instead of throwing", async () => {
		const key = await loadOrCreateSigningKey();
		expect(await verifyNonce("not-a-key", "nonce", "sig")).toBe(false);
		expect(await verifyNonce(key.publicKey, randomNonce(), "%%%")).toBe(false);
	});

	it("the private key persists across loads (one key per origin)", async () => {
		const first = await loadOrCreateSigningKey();
		const second = await loadOrCreateSigningKey();
		const nonce = randomNonce();
		expect(
			await verifyNonce(second.publicKey, nonce, await signNonce(first.privateKey, nonce)),
		).toBe(true);
	});

	it("the public key looks like a snippet `k=` value", async () => {
		const key = await loadOrCreateSigningKey();
		expect(looksLikePublicKey(key.publicKey)).toBe(true);
		expect(looksLikePublicKey("short")).toBe(false);
		expect(looksLikePublicKey(undefined)).toBe(false);
	});

	it("nonces are fresh and the right shape", () => {
		const a = randomNonce();
		const b = randomNonce();
		expect(a).not.toBe(b);
		expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
	});
});
