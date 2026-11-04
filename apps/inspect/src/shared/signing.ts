/**
 * ECDSA P-256 challenge-response over the dial direction. The panel
 * proves possession of a signing key BEFORE the inspector ships a
 * single credential (hello carries launch params, the locator and the
 * clientId; the broker hands a stopped peer id to whoever registers it
 * first, so the id alone proves nothing). The private key never leaves
 * the panel origin. Hostile pages live on other origins; the snippet
 * URL carries the PUBLIC half only, so a leaked snippet lets anyone
 * FIND the panel but nobody else can answer the challenge.
 *
 * Shared by the panel (sign) and the inspector (verify). Dependency-
 * free and zod-free, since the inspector bundle must never pull zod.
 */

const ECDSA: EcKeyGenParams = { name: "ECDSA", namedCurve: "P-256" };
const SIGN_ALGO: EcdsaParams = { name: "ECDSA", hash: "SHA-256" };
const STORAGE_KEY = "vkma:inspect:signing-key";
/** The private key persists per origin; Rotate changes the peer id but
 * deliberately keeps the key. The pubkey is public anyway, and other
 * tabs' snippets embed it. */

export interface SigningKey {
	privateKey: CryptoKey;
	/** SPKI, base64url, the snippet's `k=` parameter. */
	publicKey: string;
}

function toBase64Url(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
	const padded = value.replaceAll("-", "+").replaceAll("_", "/");
	const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
	const buffer = new ArrayBuffer(binary.length);
	const bytes = new Uint8Array(buffer);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function utf8(value: string): Uint8Array<ArrayBuffer> {
	const source = new TextEncoder().encode(value);
	const buffer = new ArrayBuffer(source.length);
	const bytes = new Uint8Array(buffer);
	bytes.set(source);
	return bytes;
}

/** 32 random bytes, base64url, one challenge per connection. */
export function randomNonce(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return toBase64Url(bytes);
}

/** The public JWK of a private EC JWK (drop `d`, verify-only). */
function publicJwkOf(jwk: JsonWebKey): JsonWebKey {
	const { d: _d, ...pub } = jwk;
	return { ...pub, key_ops: ["verify"] };
}

/** The panel's persistent signing key: generated once, stored as JWK
 * (best effort, with storage denied the key is ephemeral and old
 * snippets stop verifying; the console error says so). */
export async function loadOrCreateSigningKey(): Promise<SigningKey> {
	const stored = (() => {
		try {
			return localStorage.getItem(STORAGE_KEY);
		} catch {
			return undefined;
		}
	})();
	if (typeof stored === "string") {
		try {
			const jwk = JSON.parse(stored) as JsonWebKey;
			const privateKey = await crypto.subtle.importKey("jwk", jwk, ECDSA, true, ["sign"]);
			const publicKeyJwk = await crypto.subtle.importKey(
				"jwk",
				publicJwkOf(jwk),
				ECDSA,
				true,
				["verify"],
			);
			const spki = await crypto.subtle.exportKey("spki", publicKeyJwk);
			return {
				privateKey,
				publicKey: toBase64Url(new Uint8Array(spki)),
			};
		} catch {
			// corrupted entry, fall through and regenerate
		}
	}
	const pair = await crypto.subtle.generateKey(ECDSA, true, ["sign", "verify"]);
	const spki = await crypto.subtle.exportKey("spki", pair.publicKey);
	try {
		const jwk = await crypto.subtle.exportKey("jwk", pair.privateKey);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(jwk));
	} catch {
		console.error(
			"[vkma-inspect] storage denied — the signing key is ephemeral, old snippets will not verify",
		);
	}
	return {
		privateKey: pair.privateKey,
		publicKey: toBase64Url(new Uint8Array(spki)),
	};
}

/** Loose shape check for a `k=` value before it is trusted as input. */
export function looksLikePublicKey(value: string | undefined): value is string {
	return typeof value === "string" && /^[A-Za-z0-9_-]{100,400}$/.test(value);
}

export async function signNonce(privateKey: CryptoKey, nonce: string): Promise<string> {
	const sig = await crypto.subtle.sign(SIGN_ALGO, privateKey, utf8(nonce));
	return toBase64Url(new Uint8Array(sig));
}

/** @returns false for any garbage, import and crypto failures included. */
export async function verifyNonce(
	publicKeySpki: string,
	nonce: string,
	signature: string,
): Promise<boolean> {
	try {
		const key = await crypto.subtle.importKey(
			"spki",
			fromBase64Url(publicKeySpki),
			ECDSA,
			true,
			["verify"],
		);
		return await crypto.subtle.verify(SIGN_ALGO, key, fromBase64Url(signature), utf8(nonce));
	} catch {
		return false;
	}
}
