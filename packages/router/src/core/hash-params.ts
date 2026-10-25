/**
 * Hash payload helpers for the VK history: the whole router location rides
 * in ONE hash query param, foreign hash params (launch params, UTM) are
 * preserved next to it and never leak into the router's search. The real
 * `location.search` — where VK puts launch params on the web platform — is
 * never touched.
 */

export function readHashParams(win: Window): URLSearchParams {
	return new URLSearchParams(win.location.hash.replace(/^#\?/, ""));
}

/** Serialize a router href into the hash, preserving foreign params. */
export function writeHashParams(win: Window, pathParam: string, href: string): string {
	const params = readHashParams(win);
	params.set(pathParam, href);
	return `${win.location.pathname}${win.location.search}#?${params.toString()}`;
}

/** Hash content (`?…` string) for a router href — the SetLocation payload. */
export function serializeHashPayload(win: Window, pathParam: string, href: string): string {
	const params = readHashParams(win);
	params.set(pathParam, href);
	return `?${params.toString()}`;
}

/** Extract the router href from a SetLocation/ChangeFragment payload. */
export function parseHashPayload(payload: string, pathParam: string): string {
	return new URLSearchParams(payload.replace(/^\?/, "")).get(pathParam) ?? "/";
}
