import { normalizeBridgeEvent, type VkBridgeLike } from "./bridge-like.ts";
import { serializeHashPayload, parseHashPayload } from "./hash-params.ts";

/**
 * The host↔app location sync contract:
 * - every committed history change → `VKWebAppSetLocation`
 *   (`replace_state: true`) so the host URL/share reflects the app;
 * - incoming `VKWebAppChangeFragment` / `VKWebAppLocationChanged`
 *   (host-initiated jumps) → `history.replace(href)`;
 * - loop protection: an incoming href equal to the current one is ignored.
 *
 * The initial location is sent once at creation — the host must learn
 * where the app started. Payloads are serialized from the history EVENT's
 * location: subscribers are notified synchronously before the history's
 * microtask flush writes the URL, so `window.location.hash` is stale by
 * one entry at notify time.
 */

const LOCATION_EVENTS = new Set(["VKWebAppChangeFragment", "VKWebAppLocationChanged"]);

export interface BridgeSyncOptions {
	window?: Window;
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
	pathParam?: string;
}

export function createBridgeSync(options: BridgeSyncOptions): { destroy(): void } {
	const win = options.window ?? window;
	const pathParam = options.pathParam ?? "path";

	let lastSent = "";

	const sendLocation = (location: { pathname: string; search: string; hash: string }): void => {
		const payload = serializeHashPayload(
			win,
			pathParam,
			`${location.pathname}${location.search}${location.hash}`,
		);
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
		const incoming = parseHashPayload(data?.location ?? "", pathParam);
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
