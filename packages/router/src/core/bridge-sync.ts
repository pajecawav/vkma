import { normalizeBridgeEvent, type VkBridgeLike } from "./bridge-like.ts";
import { parseHashLocation, serializeHashLocation } from "./hash-params.ts";

/**
 * The host↔app location sync contract:
 * - every committed history change → `VKWebAppSetLocation`
 *   (`replace_state: true`) so the host URL/share reflects the app;
 * - incoming `VKWebAppChangeFragment` / `VKWebAppLocationChanged`
 *   (host-initiated jumps) → `history.replace(href)`;
 * - loop protection: an incoming href equal to the current one is ignored.
 *
 * Payload codecs come from the history (they are mode-specific: hash mode
 * sends the hash content, hash-param mode sends `?path=…` preserving
 * foreign params). The initial location is sent once at creation.
 * Serialization happens from the history EVENT's location: subscribers are
 * notified synchronously before the microtask flush writes the URL, so
 * `window.location.hash` is stale by one entry at notify time.
 */

const LOCATION_EVENTS = new Set(["VKWebAppChangeFragment", "VKWebAppLocationChanged"]);

export interface BridgeSyncOptions {
	history: {
		location: { pathname: string; search: string; hash: string };
		subscribe(
			listener: (event: {
				location: { pathname: string; search: string; hash: string };
			}) => void,
		): () => void;
		replace(path: string): void;
	};
	bridge: VkBridgeLike;
	/**
	 * SetLocation payload for a committed location. Defaults to the hash
	 * mode (the hash content); hash-param users pass the codecs from
	 * `createVkHistory`.
	 */
	serializePayload?: (location: { pathname: string; search: string; hash: string }) => string;
	/** Router href from a SetLocation/ChangeFragment payload. */
	parsePayload?: (payload: string) => string;
}

/** Hash-mode codecs are the defaults. */
const serializeDefault = (location: { pathname: string; search: string; hash: string }): string =>
	serializeHashLocation(location);

const parseDefault = (payload: string): string => parseHashLocation(payload);

export function createBridgeSync(options: BridgeSyncOptions): { destroy(): void } {
	const serializePayload = options.serializePayload ?? serializeDefault;
	const parsePayload = options.parsePayload ?? parseDefault;
	let lastSent = "";

	const sendLocation = (location: { pathname: string; search: string; hash: string }): void => {
		const payload = serializePayload(location);
		if (payload !== lastSent) {
			lastSent = payload;
			void options.bridge.send("VKWebAppSetLocation", {
				location: payload,
				replace_state: true,
			});
		}
	};

	// the host must learn the location the app started at
	sendLocation(options.history.location);

	const unsubscribeHistory = options.history.subscribe(event => {
		sendLocation(event.location);
	});

	const unsubscribeBridge = options.bridge.subscribe(rawEvent => {
		const event = normalizeBridgeEvent(rawEvent);
		if (event === null || !LOCATION_EVENTS.has(event.type)) {
			return;
		}
		const data = event.data as { location?: string } | undefined;
		if (!data?.location) {
			return; // malformed — the host always sends a location; never act on it
		}
		const incoming = parsePayload(data.location);
		const current = `${options.history.location.pathname}${options.history.location.search}`;
		if (incoming === current) {
			return; // echo of our own location — loop protection
		}
		options.history.replace(incoming);
	});

	return {
		destroy() {
			unsubscribeHistory();
			unsubscribeBridge();
		},
	};
}
