import { CLAIM_WINDOW_MS, PEER_ID_PREFIX, PEER_ID_RANDOM_LENGTH } from "../shared/config.ts";

/**
 * The UI's peer id lifecycle. The id is the capability every inspector
 * URL embeds, so it must survive reloads of THIS tab (the phone's script
 * tag points at it) while never being held by two live tabs (two peers
 * cannot register one id on the broker).
 *
 * sessionStorage keeps the per-tab id across reloads; localStorage is
 * only the SEED for fresh tabs — that seed is what keeps a snippet cut
 * yesterday working tomorrow, so it is written by first settles and by
 * Rotate ONLY. A fresh tab adopting the seed claims it first: the living
 * incumbent answers `taken` (each tab speaks for its id for its whole
 * lifetime, not just during settling) and the claimant mints a
 * session-local replacement — the seed keeps naming the incumbent's id,
 * which is exactly what the already-distributed snippets reference. Two
 * tabs settling at once (browser session restore) tie-break on the
 * smaller claim token, so exactly one of them keeps the seeded id.
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

let guard: BroadcastChannel | undefined;
/** The id this tab currently speaks for (the incumbent side). */
let heldId = "";
/** True while resolvePeerId's claim loop is running. */
let settling = false;
let activeToken = "";
let lost = false;

function newClaimToken(): string {
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function post(message: IdMessage): void {
	// BroadcastChannel.postMessage takes only the message — there is
	// no targetOrigin (the rule is a false positive here).
	// oxlint-disable-next-line unicorn/require-post-message-target-origin
	guard?.postMessage(message);
}

function armGuard(): boolean {
	if (typeof BroadcastChannel === "undefined") {
		return false;
	}
	if (guard !== undefined) {
		return true;
	}
	guard = new BroadcastChannel(PEER_ID_CHANNEL);
	guard.addEventListener("message", (event: MessageEvent<IdMessage | undefined>) => {
		const message = event.data;
		if (message === undefined) {
			return;
		}
		if (message.type === "claim") {
			if (message.id !== heldId || message.token === activeToken) {
				return;
			}
			if (settling && message.token < activeToken) {
				// a concurrent settle claimed the same seeded id: the
				// smaller token keeps it — both sides compute the same
				// winner, so exactly one tab ends up holding the id the
				// seed (and the snippets) name
				lost = true;
				return;
			}
			post({ type: "taken", id: message.id, token: message.token });
			return;
		}
		if (message.type === "taken" && message.token === activeToken && message.id === heldId) {
			lost = true;
		}
	});
	return true;
}

/**
 * Settles the id for this tab: session-stored → seeded → minted, with
 * the claim handshake running inside the claim window (an incumbent or
 * a tie-break loss makes us mint a session-local replacement, up to
 * three rounds). Leaves the claim guard armed for the tab's lifetime.
 */
export async function resolvePeerId(): Promise<string> {
	const session = readStorage(sessionStorage, PEER_ID_KEY);
	let id = looksLikePeerId(session) ? session : readStorage(localStorage, PEER_ID_KEY);
	if (!looksLikePeerId(id)) {
		id = mintPeerId();
		// the first panel on this origin — the seed starts here, every
		// snippet cut from now on embeds this id
		persist(localStorage, PEER_ID_KEY, id);
	}
	persist(sessionStorage, PEER_ID_KEY, id);

	if (!armGuard()) {
		return id;
	}
	heldId = id;

	settling = true;
	try {
		for (let round = 0; round < 3; round++) {
			lost = false;
			activeToken = newClaimToken();
			post({ type: "claim", id, token: activeToken });
			await new Promise(resolve => setTimeout(resolve, CLAIM_WINDOW_MS));
			if (!lost) {
				return id;
			}
			id = mintPeerId();
			heldId = id;
			persist(sessionStorage, PEER_ID_KEY, id);
		}
		return id;
	} finally {
		settling = false;
		activeToken = "";
	}
}

/** The explicit "this id leaked, burn it" action: a fresh id persisted
 * for this tab AND as the seed — the old id must never be adopted
 * again. Phone pages still holding the old id in their script tag keep
 * retrying a dead peer until the tag is updated — the panel says so. */
export function rotatePeerId(): string {
	const id = mintPeerId();
	persist(sessionStorage, PEER_ID_KEY, id);
	persist(localStorage, PEER_ID_KEY, id);
	heldId = id;
	return id;
}

/** Drop the claim guard (runtime dispose — the page teardown closes it
 * anyway; this is for clean tests and explicit disposal). */
export function stopClaimGuard(): void {
	guard?.close();
	guard = undefined;
}
