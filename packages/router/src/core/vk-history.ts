import { createBrowserHistory } from "@tanstack/history";
import {
	parseHashLocation,
	parseHashPayload,
	readHrefFromHash,
	serializeHashPayload,
	writeHashParams,
} from "./hash-params.ts";

/**
 * VK history: the same trick TanStack's own hash history uses —
 * `createBrowserHistory` with swapped `parseLocation`/`createHref` — so we
 * inherit blockers with rollback, popstate classification, throttling and
 * TSR index/key stamping.
 *
 * Modes (parity with the old router's three factories):
 * - `"hash"` (default) → old `createHashRouter`: the hash IS the location
 *   (`#/item/7?tab=x`).
 * - `"hash-param"` → old `createHashParamRouter`: the whole router
 *   location rides in one hash query param (`#?path=%2Fitem%2F7`), foreign
 *   hash params (launch params, UTM) are preserved next to it, and the
 *   real `location.search` is never touched.
 *
 * Deep links written by the OTHER mode resolve too (legacy tolerance).
 * `"browser"` → pass TanStack's default history instead (omit `history`
 * in createRouter) — old `createBrowserRouter`.
 */

export const DEFAULT_PATH_PARAM = "path";

export type VkHistoryMode = "hash" | "hash-param";

interface HistoryState {
	key: string;
	__TSR_key: string;
	__TSR_index: number;
}

export interface VkHistoryOptions {
	window?: Window;
	/** Hash query param carrying the router location (hash-param mode). */
	pathParam?: string;
	/** URL mode. Default `"hash"`. */
	mode?: VkHistoryMode;
}

/** The history plus the payload codecs the bridge sync layer needs. */
export function createVkHistory(options: VkHistoryOptions = {}) {
	const win = options.window ?? window;
	const pathParam = options.pathParam ?? DEFAULT_PATH_PARAM;
	const mode = options.mode ?? "hash";

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

	const initStamp = (): HistoryState => {
		const rawState = win.history.state as HistoryState | null;
		if (rawState?.__TSR_key) {
			if (rawState.__TSR_index > lastIndex) {
				lastIndex = rawState.__TSR_index;
			}
			return rawState;
		}
		return stampMissingState();
	};

	if (mode === "hash-param") {
		const parseLocation = () => {
			const state = initStamp();
			const href = readHrefFromHash(win, pathParam);
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
			/** Router href from the current document hash. */
			parseCurrentHash: () => readHrefFromHash(win, pathParam),
		};
	}

	// hash mode: the hash IS the location; legacy `#?path=` links resolve too
	const hrefFromHash = (): string => {
		const hash = win.location.hash;
		if (hash.startsWith("#?")) {
			// legacy hash-param deep link — resolve the path param out of it
			return new URLSearchParams(hash.slice(2)).get(pathParam) ?? "/";
		}
		return hash.length > 1 ? hash.slice(1) : "/";
	};
	const parseLocation = () => {
		const state = initStamp();
		const href = hrefFromHash();
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
			createHref: href => `${win.location.pathname}${win.location.search}#${href}`,
		}),
		/** Hash content for a router href — the SetLocation payload. */
		serializePayload: (href: string) => href,
		/** Router href from a SetLocation/ChangeFragment payload. */
		parsePayload: (payload: string) => parseHashLocation(payload),
		/** Router href from the current document hash. */
		parseCurrentHash: hrefFromHash,
	};
}

export type VkHistory = ReturnType<typeof createVkHistory>;
