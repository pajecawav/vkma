import { CLAIM_WINDOW_MS, PEER_ID_PREFIX, PEER_ID_RANDOM_LENGTH } from "../shared/config.ts";

/**
 * The UI's peer id lifecycle. The id is the capability every inspector
 * URL embeds, so it must survive reloads of THIS tab (the phone's script
 * tag points at it) while never being shared by two live tabs (two peers
 * registering one id on the broker is an error).
 *
 * sessionStorage keeps the per-tab id across reloads; localStorage is
 * only the SEED for fresh tabs (never read back by an already-living
 * tab). "Duplicate Tab" copies sessionStorage — the BroadcastChannel
 * claim handshake (the devtools collector's) resolves that: an incumbent
 * answers `taken`, the claimant mints fresh. Claims settle before the
 * Peer is created, so the handshake never has to rotate a live peer.
 */

const PEER_ID_KEY = "vkma:inspect:peer-id";
const PEER_ID_CHANNEL = "vkma:inspect:peer-id";
const ALPHABET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function mintPeerId(): string {
	const bytes = new Uint8Array(PEER_ID_RANDOM_LENGTH);
	crypto.getRandomValues(bytes);
	let random = "";
	for (const byte of bytes) {
		random += ALPHABET[byte % ALPHABET.length];
	}
	return `${PEER_ID_PREFIX}${random}`;
}

function readStorage(storage: Storage | undefined, key: string): string | undefined {
	try {
		return storage?.getItem(key) ?? undefined;
	} catch {
		// storage denied — the id just lives for this page load
		return undefined;
	}
}

function persist(storage: Storage | undefined, key: string, value: string): void {
	try {
		storage?.setItem(key, value);
	} catch {
		// best effort only
	}
}

function looksLikePeerId(id: string | undefined): id is string {
	return (
		typeof id === "string" && id.startsWith(PEER_ID_PREFIX) && id.length > PEER_ID_PREFIX.length
	);
}

interface IdMessage {
	type: "claim" | "taken";
	id: string;
	token: string;
}

/**
 * Settles the id for this tab: session-stored → seeded → minted, with
 * the claim handshake running inside the claim window (a duplicate tab
 * holding the same id makes us mint a fresh one, up to three rounds).
 */
export async function resolvePeerId(): Promise<string> {
	let id = readStorage(sessionStorage, PEER_ID_KEY) ?? readStorage(localStorage, PEER_ID_KEY);
	if (!looksLikePeerId(id)) {
		id = mintPeerId();
	}
	persist(sessionStorage, PEER_ID_KEY, id);
	persist(localStorage, PEER_ID_KEY, id);

	if (typeof BroadcastChannel === "undefined") {
		return id;
	}

	const channel = new BroadcastChannel(PEER_ID_CHANNEL);
	const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	try {
		for (let round = 0; round < 3; round++) {
			let lost = false;
			channel.addEventListener("message", (event: MessageEvent<IdMessage | undefined>) => {
				const message = event.data;
				if (message?.type === "taken" && message.token === token && message.id === id) {
					lost = true;
				}
			});
			// BroadcastChannel.postMessage takes only the message — there is
			// no targetOrigin (the rule is a false positive here).
			// oxlint-disable-next-line unicorn/require-post-message-target-origin
			channel.postMessage({ type: "claim", id, token });
			await new Promise(resolve => setTimeout(resolve, CLAIM_WINDOW_MS));
			if (!lost) {
				return id;
			}
			id = mintPeerId();
			persist(sessionStorage, PEER_ID_KEY, id);
			persist(localStorage, PEER_ID_KEY, id);
		}
		return id;
	} finally {
		channel.close();
	}
}

/** The explicit "this id leaked, burn it" action: a fresh id persisted
 * for this tab (and as the seed). Phone pages still holding the old id
 * in their script tag keep retrying a dead peer until the tag is
 * updated — the panel says so. */
export function rotatePeerId(): string {
	const id = mintPeerId();
	persist(sessionStorage, PEER_ID_KEY, id);
	persist(localStorage, PEER_ID_KEY, id);
	return id;
}
