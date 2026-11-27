import type { ClientStatus } from "@vkma.dev/protocol";

/**
 * The Execute form's draft: what a consumer persists so the typed form
 * survives its panel page going away. In both the extension and the
 * dev-server panel the FAB iframe lives inside the page it watches and
 * dies with it on a reload. A draft belongs to one tab: the tabs of
 * different mini apps must not hand each other their params. Pure data
 * and decoders here; the storage backend lives with the consumer (one
 * chrome.storage.session entry per tab in the extension, the tab's own
 * sessionStorage in the dev-server panel).
 */

/** The Params field as it starts: an empty object with room to type in.
 * An event whose catalogue stub is empty puts the field back here. */
export const EMPTY_PARAMS = "{\n  \n}";

/** The unsuffixed key: a jar that is already one per tab (the dev-server
 * panel's sessionStorage), or a surface that watches every tab at once. */
export const EXECUTE_DRAFT_STORAGE_KEY = "vkma:execute-draft";

/** The key of one tab's draft in a jar shared by every tab. */
export function executeDraftKey(tabId?: number): string {
	return tabId === undefined
		? EXECUTE_DRAFT_STORAGE_KEY
		: `${EXECUTE_DRAFT_STORAGE_KEY}:${tabId}`;
}

export interface ExecuteDraft {
	/** Bump on shape changes; parsers reject other versions to the empty draft. */
	v: 1;
	/** The picked target's client id; "" while nothing is picked (the
	 * newest client is used). Honored only while that client is listed. */
	target: string;
	/** The picked target's page url. The extension mints client ids per
	 * page load, so a restored id is dead once the page reloaded: the url
	 * finds the same frame again under its new id. */
	targetUrl?: string;
	/** The Event field. */
	name: string;
	/** The Params field as typed, invalid JSON included. */
	paramsText: string;
	/** The params text the form wrote itself for `name` (a catalogue
	 * stub). A later pick may replace exactly this text; anything else is
	 * the user's work and stays. */
	lastAutoFill?: string;
}

export const EMPTY_EXECUTE_DRAFT: ExecuteDraft = {
	v: 1,
	target: "",
	name: "",
	paramsText: EMPTY_PARAMS,
};

/**
 * The storage decoder every surface shares: web storage hands over a
 * string, chrome.storage an already-parsed value. Anything unexpected
 * (absent, corrupt JSON, a future version, a hostile shape) degrades to
 * the empty draft instead of throwing through the render. Optional keys
 * are absent when empty, so a record always serializes the same way.
 */
export function parseExecuteDraft(raw: unknown): ExecuteDraft {
	let value: unknown = raw;
	if (typeof value === "string") {
		try {
			value = JSON.parse(value);
		} catch {
			return { ...EMPTY_EXECUTE_DRAFT };
		}
	}
	if (typeof value !== "object" || value === null) {
		return { ...EMPTY_EXECUTE_DRAFT };
	}
	const record = value as Record<string, unknown>;
	if (record["v"] !== 1) {
		return { ...EMPTY_EXECUTE_DRAFT };
	}
	const text = (key: string): string => {
		const value: unknown = record[key];
		return typeof value === "string" ? value : "";
	};
	// An optional key is stored only when it says something.
	const optional = (key: string): string | undefined => {
		const value = text(key);
		return value === "" ? undefined : value;
	};
	// A cleared field is "" (the user emptied it); only an absent or
	// non-string one falls back to the starting text.
	const paramsText: unknown = record["paramsText"];
	const draft: ExecuteDraft = {
		v: 1,
		target: text("target"),
		name: text("name"),
		paramsText: typeof paramsText === "string" ? paramsText : EMPTY_PARAMS,
	};
	const targetUrl = optional("targetUrl");
	const lastAutoFill = optional("lastAutoFill");
	if (targetUrl !== undefined) {
		draft.targetUrl = targetUrl;
	}
	if (lastAutoFill !== undefined) {
		draft.lastAutoFill = lastAutoFill;
	}
	return draft;
}

/** Field-wise equality of two drafts: object identity means nothing
 * across a storage round trip. */
export function sameExecuteDraft(a: ExecuteDraft, b: ExecuteDraft): boolean {
	return (
		a.target === b.target &&
		a.name === b.name &&
		a.paramsText === b.paramsText &&
		a.targetUrl === b.targetUrl &&
		a.lastAutoFill === b.lastAutoFill
	);
}

/**
 * The write-then-echo bookkeeping of a storage shared by several
 * surfaces. storage.onChanged fires for a surface's own writes too, in
 * write order, and every keystroke in Params is a write: the echo of an
 * earlier keystroke can land after a later one was typed, and adopted
 * blindly it would roll the field back for a beat. So a surface parks
 * each of its saves in `owed`, oldest first, until its echo comes.
 *
 * An echo that matches an owed save settles everything up to it (the
 * state already holds it) and returns true: this surface's own. Anything
 * else returns false: another surface's save, to be adopted.
 */
export function settleOwnWrite(owed: ExecuteDraft[], echo: ExecuteDraft): boolean {
	const index = owed.findIndex(entry => sameExecuteDraft(entry, echo));
	if (index === -1) {
		return false;
	}
	owed.splice(0, index + 1);
	return true;
}

/**
 * The client a send goes to: the picked target while its client is
 * listed, otherwise the same page under a new id, otherwise the newest
 * client.
 *
 * Registry order is online-first, oldest → newest within each group, so
 * the last ONLINE client is the newest live one. A bare `at(-1)` would
 * land on the OLDEST offline client the moment one exists (backgrounded
 * tab) and sends would die on the 20s exec timeout. With everyone
 * offline, the newest offline entry is still the sanest default, it may
 * just be throttled, not gone.
 */
export function resolveExecuteTarget(
	clients: readonly ClientStatus[],
	target: string,
	targetUrl: string | undefined,
): string {
	if (clients.some(client => client.clientId === target)) {
		return target;
	}
	if (targetUrl !== undefined) {
		const same = clients.filter(client => client.url === targetUrl);
		// A reloaded frame keeps its path, while its launch params and the
		// app's own route (the query, the hash) may differ.
		const page =
			same.length > 0 ? same : clients.filter(client => samePage(client.url, targetUrl));
		const found = page.toReversed().find(client => client.online) ?? page.at(-1);
		if (found !== undefined) {
			return found.clientId;
		}
	}
	return (
		clients.toReversed().find(client => client.online)?.clientId ??
		clients.at(-1)?.clientId ??
		""
	);
}

/** The same document ignoring the query and the hash. */
function samePage(a: string, b: string): boolean {
	try {
		const x = new URL(a);
		const y = new URL(b);
		return x.origin === y.origin && x.pathname === y.pathname;
	} catch {
		return false;
	}
}
