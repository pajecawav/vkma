/**
 * Hash payload helpers for the VK history.
 *
 * Two URL modes:
 * - `hash` (default): the hash IS the location (`#/item/7?tab=x`),
 *   TanStack-style, parity with the old `createHashRouter`.
 * - `hash-param`: the whole router location rides in ONE hash query param
 *   (`#?path=%2Fitem%2F7`), foreign hash params (launch params, UTM) are
 *   preserved next to it and never leak into the router's search. The real
 *   `location.search` (where VK puts launch params on the web platform)
 *   is never touched. Parity with the old `createHashParamRouter`.
 *
 * Both read paths tolerate LEGACY deep links written by the other mode
 * (`#/path` resolves in hash-param mode, `#?path=…` resolves in hash
 * mode); writes always use the active mode's canonical format.
 */

export function readHashParams(win: Window): URLSearchParams {
	return new URLSearchParams(win.location.hash.replace(/^#\?/, ""));
}

/**
 * Router href from the document hash, tolerant to both modes:
 * `#?path=%2Flist&x=1` → `/list` (hash-param), `#/list?x=1` → `/list?x=1`
 * (hash), empty or foreign hash → `/`.
 */
export function readHrefFromHash(win: Window, pathParam: string): string {
	const hash = win.location.hash;
	if (hash.startsWith("#?")) {
		return new URLSearchParams(hash.slice(2)).get(pathParam) ?? "/";
	}
	if (hash.startsWith("#/")) {
		return hash.slice(1);
	}
	return "/";
}

/** Serialize a router href into the hash, preserving foreign params. */
export function writeHashParams(win: Window, pathParam: string, href: string): string {
	const params = readHashParams(win);
	params.set(pathParam, href);
	return `${win.location.pathname}${win.location.search}#?${params.toString()}`;
}

/** Hash content (`?…` string) for a router href, the SetLocation payload. */
export function serializeHashPayload(win: Window, pathParam: string, href: string): string {
	const params = readHashParams(win);
	params.set(pathParam, href);
	return `?${params.toString()}`;
}

/** Extract the router href from a SetLocation/ChangeFragment payload. */
export function parseHashPayload(payload: string, pathParam: string): string {
	if (payload.startsWith("/")) {
		// legacy plain-hash payload (old createHashRouter hosts)
		return payload;
	}
	return new URLSearchParams(payload.replace(/^\?/, "")).get(pathParam) ?? "/";
}

/** Hash-mode SetLocation payload: the hash content IS the location. */
export function serializeHashLocation(location: {
	pathname: string;
	search: string;
	hash: string;
}): string {
	return `${location.pathname}${location.search}${location.hash}`;
}

/** Hash-mode payload → router href (normalized to a leading slash). */
export function parseHashLocation(payload: string): string {
	return payload.startsWith("/") ? payload : `/${payload}`;
}
