import { isLaunchParamKey, type ClientInfo } from "@vkma.dev/protocol";
import { CLAIM_WINDOW_MS } from "../shared/config.ts";

/**
 * Page-load identity — the devtools collector's contract: `clientId`
 * survives reloads (sessionStorage; the approval gate keys on it), a
 * fresh `sessionId` every load (the panel wipes history on change),
 * launch params off the page URL, and the duplicate-tab claim handshake
 * (sessionStorage is copied by "Duplicate Tab" — two live pages must not
 * interleave one client card).
 */

const CLIENT_ID_KEY = "vkma:clientId";
const CLIENT_ID_CHANNEL = "vkma:client-ids";

function mintId(prefix: string): string {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
	);
}

function getOrCreateClientId(): string {
	try {
		const existing = sessionStorage.getItem(CLIENT_ID_KEY);
		if (existing) {
			return existing;
		}
		const id = mintId("c");
		sessionStorage.setItem(CLIENT_ID_KEY, id);
		return id;
	} catch {
		return mintId("c"); // storage denied — the id lives for this load only
	}
}

export function collectLaunchParams(): Record<string, string> {
	const params: Record<string, string> = {};
	for (const [key, value] of new URLSearchParams(window.location.search)) {
		if (isLaunchParamKey(key)) {
			params[key] = value;
		}
	}
	return params;
}

/** Native bridges first (the inspector may be a top-level webview page),
 * then the collector's frame/mobile/standalone ladder. */
export function detectPlatform(launchParams: Record<string, string>): string {
	const w = window as unknown as {
		AndroidBridge?: unknown;
		webkit?: { messageHandlers?: Record<string, unknown> };
	};
	if (typeof w.AndroidBridge === "object" && w.AndroidBridge !== null) {
		return "android";
	}
	if (typeof w.webkit?.messageHandlers?.["VKWebAppClose"] === "object") {
		return "ios";
	}
	const inFrame = window.self !== window.top;
	// vk_platform is the modern value; legacy games pass platform=mobile_*
	const mobile =
		launchParams["vk_platform"] === "mobile_web" ||
		(launchParams["platform"] ?? "").startsWith("mobile") ||
		/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
	// legacy games identify by api_id, not vk_app_id
	if (!launchParams["vk_app_id"] && !launchParams["api_id"] && !inFrame) {
		return "standalone";
	}
	if (mobile) {
		return "mobile-web";
	}
	if (inFrame) {
		return "iframe";
	}
	return "desktop-web";
}

interface IdMessage {
	type: "claim" | "taken";
	id: string;
	token: string;
}

export interface CollectorIdentity {
	readonly clientId: string;
	readonly sessionId: string;
	readonly launchParams: Record<string, string>;
	readonly platform: string;
	/** The hello payload; `bridge` reflects the settled capture mode. */
	clientInfo(bridge: boolean): ClientInfo;
	/** Re-assert the client-id claim (a frozen twin may answer late). */
	reassertClaim(): void;
}

export function createIdentity(onClientIdChange: () => void): CollectorIdentity {
	const launchParams = collectLaunchParams();
	const platform = detectPlatform(launchParams);
	let clientId = getOrCreateClientId();
	const sessionId = mintId("s");
	const connectedAt = Date.now();

	const claim = watchClientIds(next => {
		clientId = next;
		onClientIdChange();
	});

	return {
		get clientId() {
			return clientId;
		},
		sessionId,
		launchParams,
		platform,
		clientInfo(bridge: boolean): ClientInfo {
			// Only the curated launch params ever leave the page as the
			// url's query — the complete href (OAuth codes, emails,
			// fragment tokens) must not ride along beside the filtered
			// launchParams.
			let url: string;
			try {
				const minimized = new URL(window.location.href);
				minimized.search = new URLSearchParams(launchParams).toString();
				minimized.hash = "";
				url = minimized.toString();
			} catch {
				url = window.location.origin + window.location.pathname;
			}
			return {
				clientId,
				sessionId,
				connectedAt,
				lastSeenAt: Date.now(),
				ua: navigator.userAgent,
				url,
				platform,
				bridge,
				appId: launchParams["vk_app_id"] ?? launchParams["api_id"],
				launchParams,
			};
		},
		reassertClaim: claim ?? (() => {}),
	};
}

/** The BroadcastChannel claim handshake; @returns the re-assert function. */
function watchClientIds(onRegenerate: (next: string) => void): (() => void) | undefined {
	if (typeof BroadcastChannel === "undefined") {
		return undefined;
	}
	const channel = new BroadcastChannel(CLIENT_ID_CHANNEL);
	const token = mintId("t");
	let current = getCurrentClientId();

	const claim = () => {
		// BroadcastChannel.postMessage takes only the message — there is
		// no targetOrigin (the rule is a false positive here).
		// oxlint-disable-next-line unicorn/require-post-message-target-origin
		channel.postMessage({ type: "claim", id: current, token });
	};

	channel.addEventListener("message", (event: MessageEvent<IdMessage | undefined>) => {
		const message = event.data;
		if (message === null || message === undefined) {
			return;
		}
		if (message.type === "claim") {
			if (message.token !== token && message.id === current) {
				// oxlint-disable-next-line unicorn/require-post-message-target-origin
				channel.postMessage({ type: "taken", id: message.id, token: message.token });
			}
			return;
		}
		if (message.type === "taken" && message.token === token && message.id === current) {
			// my claim lost — mint a fresh id, re-verify it, re-register
			current = mintId("c");
			try {
				sessionStorage.setItem(CLIENT_ID_KEY, current);
			} catch {
				// best effort — this load keeps the id in memory
			}
			onRegenerate(current);
			claim();
		}
	});

	claim();
	return claim;
}

function getCurrentClientId(): string {
	try {
		return sessionStorage.getItem(CLIENT_ID_KEY) ?? "";
	} catch {
		return "";
	}
}

/** The claim window the caller waits out before the first hello. */
export const claimWindow = (): Promise<void> =>
	new Promise(resolve => setTimeout(resolve, CLAIM_WINDOW_MS));
