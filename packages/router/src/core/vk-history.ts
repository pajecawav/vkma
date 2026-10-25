import { createBrowserHistory, parseHref } from "@tanstack/history";
import {
	parseHashPayload,
	readHashParams,
	serializeHashPayload,
	writeHashParams,
} from "./hash-params.ts";

/**
 * VK history: the same trick TanStack's own hash history uses —
 * `createBrowserHistory` with swapped `parseLocation`/`createHref` — so we
 * inherit blockers with rollback, popstate classification, throttling and
 * TSR index/key stamping.
 *
 * The whole router location (path + search) lives in one hash query param
 * (`#?path=%2Fitem%2F7`), foreign hash params (launch params, UTM) are
 * preserved next to it, and the real `location.search` is never touched.
 */

export const DEFAULT_PATH_PARAM = "path";

interface HistoryState {
	key: string;
	__TSR_key: string;
	__TSR_index: number;
}

export interface VkHistoryOptions {
	window?: Window;
	/** Hash query param carrying the router location. Default `"path"`. */
	pathParam?: string;
}

export function createVkHistory(options: VkHistoryOptions = {}) {
	const win = options.window ?? window;
	const pathParam = options.pathParam ?? DEFAULT_PATH_PARAM;

	let lastIndex = -1;

	/**
	 * A history entry without TanStack state (manual hash edit / foreign
	 * pushState) gets a FRESH index = lastIndex + 1, so popstate classifies
	 * it as FORWARD — the entry behaves like a push (an entry parsed as
	 * index 0 would desync any parallel stack mirror).
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
		const href = readHashParams(win).get(pathParam) ?? "/";
		const url = new URL(href, win.location.origin);
		return {
			href,
			pathname: url.pathname,
			search: url.search,
			hash: url.hash,
			state,
		};
	};

	return {
		history: createBrowserHistory({
			window: win,
			parseLocation,
			createHref: href => writeHashParams(win, pathParam, href),
		}),
		/** Hash content for a router href — the SetLocation payload. */
		serializePayload: (href: string) => serializeHashPayload(win, pathParam, href),
		/** Router href from a SetLocation/ChangeFragment payload. */
		parsePayload: (payload: string) => parseHashPayload(payload, pathParam),
		/** Extract the router href from the current document hash. */
		parseCurrentHash: () => readHashParams(win).get(pathParam) ?? "/",
	};
}

export type VkHistory = ReturnType<typeof createVkHistory>;

export { parseHref };
