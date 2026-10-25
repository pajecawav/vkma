import { createBrowserHistory, type RouterHistory } from "@tanstack/react-router";

/**
 * PROTOTYPE (spike 3) — VK history, the piece that lifts into the core.
 *
 * The whole router location (path + search) lives in ONE hash query param
 * (`?path=%2Fitem%2F7`), exactly like the old router's hash-param mode:
 * foreign hash params (launch params, UTM) are preserved next to it and
 * never leak into the router's search. The real `location.search` (where
 * VK puts launch params on the web platform) is not touched either.
 *
 * Built on `createBrowserHistory` with swapped parseLocation/createHref —
 * the same trick TanStack's own createHashHistory uses — so we inherit
 * blockers with rollback, popstate classification, throttling and
 * index/key stamping.
 */

const PATH_PARAM_DEFAULT = "path";

interface HistoryState {
	__TSR_index: number;
	__TSR_key: string;
	key: string;
}

export interface VkHistoryOptions {
	window?: Window;
	pathParam?: string;
}

export function createVkHistory(options: VkHistoryOptions = {}): RouterHistory {
	const win = options.window ?? window;
	const pathParam = options.pathParam ?? PATH_PARAM_DEFAULT;

	let lastIndex = -1;

	const readHashParams = (): URLSearchParams =>
		new URLSearchParams(win.location.hash.replace(/^#\?/, ""));

	/** Serialize a router href into the hash, preserving foreign params. */
	const writeHashParams = (href: string): string => {
		const params = readHashParams();
		params.set(pathParam, href);
		return `${win.location.pathname}${win.location.search}#?${params.toString()}`;
	};

	/**
	 * A history entry without TanStack state (manual hash edit / foreign
	 * pushState) gets a FRESH index = lastIndex + 1, so popstate classifies
	 * it as FORWARD — the entry behaves like a push (old router's trick;
	 * without it the entry parses as index 0 and desyncs the stack mirror).
	 */
	const stampMissingState = (): HistoryState => {
		lastIndex += 1;
		const key = Math.random().toString(36).slice(2, 8);
		const state: HistoryState = { __TSR_index: lastIndex, key, __TSR_key: key };
		win.history.replaceState(state, "", win.location.href);
		return state;
	};

	const parseLocation = () => {
		const rawState = win.history.state as HistoryState | null;
		const state: HistoryState = rawState?.__TSR_key ? rawState : stampMissingState();
		if (rawState?.__TSR_key) {
			lastIndex = rawState.__TSR_index;
		}
		const href = readHashParams().get(pathParam) ?? "/";
		const url = new URL(href, win.location.origin);
		return {
			href,
			pathname: url.pathname,
			search: url.search,
			hash: url.hash,
			state,
		};
	};

	return createBrowserHistory({
		window: win,
		parseLocation,
		createHref: writeHashParams,
	});
}
