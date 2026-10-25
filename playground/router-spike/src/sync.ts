import { fakeBridge } from "./bridge";
import { router } from "./routes";

/**
 * PROTOTYPE (spike 3) — the bridge sync contract:
 * - every committed history change → `VKWebAppSetLocation` (replace_state)
 * - incoming `VKWebAppChangeFragment` → router.navigate(replace)
 * - loop protection: incoming location equal to the current one is ignored.
 *
 * Exported as an init function (called from main.tsx) — importing this
 * module from routes.ts would be a TDZ cycle.
 */

let lastSent = "";

const hashPayload = (): string => window.location.hash.replace(/^#/, "");

/**
 * Serialize from the EVENT's location (not window.location — the history
 * notifies subscribers synchronously BEFORE its microtask flush writes the
 * URL, so window.hash can be stale by one entry).
 */
const payloadFromLocation = (location: {
	pathname: string;
	search: string;
	hash: string;
}): string => {
	const params = new URLSearchParams(window.location.hash.replace(/^#\?/, ""));
	params.set("path", `${location.pathname}${location.search}${location.hash}`);
	return `?${params.toString()}`;
};

export function initBridgeSync(): void {
	// the host must learn the location the app started at
	const sendInitial = () => {
		if (lastSent === "") {
			lastSent = payloadFromLocation(router.history.location);
			void fakeBridge.send("VKWebAppSetLocation", {
				location: lastSent,
				replace_state: true,
			});
		}
	};
	sendInitial();

	router.history.subscribe(event => {
		console.log(
			"[spike3] history event:",
			event.action.type,
			"loc:",
			event.location.pathname,
			"staleHash:",
			hashPayload(),
		);
		const payload = payloadFromLocation(event.location);
		if (payload !== lastSent) {
			lastSent = payload;
			void fakeBridge.send("VKWebAppSetLocation", {
				location: payload,
				replace_state: true,
			});
		}
	});

	fakeBridge.subscribe(event => {
		if (event.type !== "VKWebAppChangeFragment") {
			return;
		}
		const location = (event.data as { location: string }).location;
		const incoming = new URLSearchParams(location.replace(/^\?/, "")).get("path") ?? "/";
		if (incoming === router.state.location.href) {
			return; // echo of our own location — loop protection
		}
		void router.navigate({ href: incoming, replace: true });
	});
}
