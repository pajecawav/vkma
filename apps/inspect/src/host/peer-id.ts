import { CLAIM_WINDOW_MS, PEER_ID_PREFIX, PEER_ID_RANDOM_LENGTH } from "../shared/config.ts";

/**
 * The UI's peer id lifecycle. The id is the capability every inspector
 * URL embeds, so it must survive reloads of THIS tab (the phone's script
 * tag points at it) while never being held by two live tabs (two peers
 * cannot register one id on the broker).
 *
 * The DEFAULT lifetime is this tab: sessionStorage only. The broker
 * hands a stopped id to whoever registers it first (verified against
 * the public cloud, re-grant lands within ~300 ms of the holder's
 * socket dying, and the registration token proves nothing), so a leaked
 * id must not outlive the session it leaked from: a fresh tab mints a
 * fresh id, and snippets cut under a session-local id die with it.
 * Stability across tabs is an explicit opt-in, PINNING. A pinned id is
 * adopted by fresh tabs and claimed first (the living incumbent answers
 * `taken`, each tab speaks for its id for its whole lifetime); two tabs
 * settling at once (browser session restore) tie-break on the smaller
 * claim token. Rotate re-pins the replacement. A burned id must never
 * be revived by the pin.
 */

const PEER_ID_KEY = "vkma:inspect:peer-id";
/** The explicit pin lives under its own key: an upgrade-era seed must
 * not count as one. The switch reads false until the operator pins. */
const PEER_ID_PIN_KEY = "vkma:inspect:peer-id-pin";
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
		// storage denied, the id just lives for this page load
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
	// BroadcastChannel.postMessage takes only the message. There is
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
				// smaller token keeps it. Both sides compute the same
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
 * Settles the id for this tab: session-stored → pinned → minted, with
 * the claim handshake running inside the claim window (an incumbent or
 * a tie-break loss makes us mint a session-local replacement, up to
 * three rounds). Leaves the claim guard armed for the tab's lifetime.
 */
export async function resolvePeerId(): Promise<string> {
	const session = readStorage(sessionStorage, PEER_ID_KEY);
	let id = looksLikePeerId(session) ? session : readStorage(localStorage, PEER_ID_PIN_KEY);
	if (!looksLikePeerId(id)) {
		id = mintPeerId();
		// session-local by default: only an explicit pin writes the id
		// into localStorage, because the pin is exactly the decision to
		// keep answering this id across tabs. The pre-pin seed key is
		// deliberately NOT read anymore. An upgrade must land pinned
		// off, snippets cut under the old id included.
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
 * for this tab, and for fresh tabs too when the id was pinned, the pin
 * follows the rotation, so a burned id never revives from localStorage.
 * Phone pages still holding the old id in their script tag keep
 * retrying a dead peer until the tag is updated, the panel says so. */
export function rotatePeerId(): string {
	const id = mintPeerId();
	persist(sessionStorage, PEER_ID_KEY, id);
	if (isPeerIdPinned()) {
		persist(localStorage, PEER_ID_PIN_KEY, id);
	} else {
		// a stale pre-pin seed must not linger: nothing reads it, and
		// leaving it behind would make the state lie about the switch
		unpinPeerId();
	}
	heldId = id;
	return id;
}

/** Whether fresh tabs of this origin adopt the current id (snippet
 * stability across tabs is opt-in, see the module doc). */
export function isPeerIdPinned(): boolean {
	return looksLikePeerId(readStorage(localStorage, PEER_ID_PIN_KEY));
}

/** The explicit opt-in: keep answering this id in fresh tabs. */
export function pinPeerId(id: string): void {
	persist(localStorage, PEER_ID_PIN_KEY, id);
}

/** Back to session-local: fresh tabs will mint their own ids. Also
 * clears the upgrade-era seed key, it is no longer read, and stale
 * copies would only confuse a future migration. */
export function unpinPeerId(): void {
	for (const key of [PEER_ID_PIN_KEY, PEER_ID_KEY]) {
		try {
			localStorage.removeItem(key);
		} catch {
			// best effort only
		}
	}
}

/** Drop the claim guard (runtime dispose, the page teardown closes it
 * anyway; this is for clean tests and explicit disposal). */
export function stopClaimGuard(): void {
	guard?.close();
	guard = undefined;
}
