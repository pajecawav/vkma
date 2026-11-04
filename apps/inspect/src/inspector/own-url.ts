/**
 * Finding the inspector's own URL. The target peer id rides its query
 * string. Three levels because the two load modes see the world
 * differently: a classic <script> tag can read `document.currentScript`,
 * a console `import()` cannot (modules have no currentScript. There may
 * not even be a tag); the resource timing entry of our own fetch keeps
 * the full URL with the query in that case.
 */

/** A script whose path ends in `/inspector.js` on any origin. */
function isInspectorUrl(url: string): boolean {
	try {
		return new URL(url, window.location.href).pathname.endsWith("/inspector.js");
	} catch {
		return false;
	}
}

export function resolveInspectorSourceUrl(
	doc: Document = document,
	perf: Performance = performance,
): string | undefined {
	// 1) The classic case: we ARE the currently executing script.
	const current = doc.currentScript as HTMLScriptElement | null;
	if (current !== null && isInspectorUrl(current.src)) {
		return current.src;
	}
	// 2) A tag on the page (someone else placed it, or we are a module).
	for (const element of doc.querySelectorAll<HTMLScriptElement>("script[src]")) {
		if (isInspectorUrl(element.src)) {
			return element.src;
		}
	}
	// 3) The console import(): no tag at all. The resource timing entry
	//    of our own load is the only place the URL survives.
	const entries = perf.getEntriesByType("resource").filter(entry => isInspectorUrl(entry.name));
	return entries.at(-1)?.name;
}

/** The `?id=` peer id, validated loosely (shape is the broker's business). */
export function peerIdFromUrl(url: string): string | undefined {
	try {
		const id = new URL(url).searchParams.get("id");
		return id !== null && /^[A-Za-z0-9_-]{8,64}$/.test(id) ? id : undefined;
	} catch {
		return undefined;
	}
}

/** The `?k=` signing key of the answering panel (the public half,
 * SPKI base64url). A snippet without it cannot verify anyone. The
 * collector refuses to ship credentials over such a connection. */
export function signingKeyFromUrl(url: string): string | undefined {
	try {
		const key = new URL(url).searchParams.get("k");
		return key !== null && /^[A-Za-z0-9_-]{100,400}$/.test(key) ? key : undefined;
	} catch {
		return undefined;
	}
}
