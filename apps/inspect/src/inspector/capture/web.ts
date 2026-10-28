/**
 * Web-transcript capture. Incoming (host → app) needs no interception
 * at all: the VK webview dispatches a `VKWebAppEvent` DOM CustomEvent
 * and the web host postMessages the frame — both land on `window`,
 * a listener is enough. Outgoing is only visible on a TOP-LEVEL page
 * (parent === window, the app's web transport posts to THIS window and
 * the method is wrappable); in a cross-origin iframe `parent.postMessage`
 * cannot be wrapped from the child — the documented partial mode
 * (incoming events + executes only; the extension covers the full case).
 */

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

export interface WebCaptureHandlers {
	onIncoming(type: string, data: Record<string, unknown>): void;
	onOutgoing(name: string, params: Record<string, unknown>): void;
}

export function installWebCapture(handlers: WebCaptureHandlers): void {
	// host → app in the webview: window.VKWebAppEvent {detail: {type, data}}
	window.addEventListener("VKWebAppEvent", event => {
		const detail = (event as CustomEvent).detail;
		if (!isPlainObject(detail)) {
			return;
		}
		const type = detail["type"];
		const data = detail["data"];
		if (typeof type === "string" && type.startsWith("VKWebApp") && isPlainObject(data)) {
			handlers.onIncoming(type, data);
		}
	});

	// host → app on the web: window message {type, data, frameId?}
	window.addEventListener("message", event => {
		if (event.source === window) {
			return; // self-post chatter, never host traffic
		}
		const data: unknown = event.data;
		if (!isPlainObject(data)) {
			return;
		}
		const type = data["type"];
		const payload = data["data"];
		if (typeof type === "string" && type.startsWith("VKWebApp") && isPlainObject(payload)) {
			handlers.onIncoming(type, payload);
		}
	});

	if (window.parent === window) {
		wrapWindowPostMessage((name, params) => handlers.onOutgoing(name, params));
	}
}

/** app → host on a top-level page: every vk-connect envelope posted to
 * this very window rides through here. */
function wrapWindowPostMessage(
	onOutgoing: (name: string, params: Record<string, unknown>) => void,
): void {
	const original = window.postMessage.bind(window) as (...args: unknown[]) => unknown;
	const wrapped = (...args: unknown[]) => {
		const message = args[0];
		if (isPlainObject(message) && message["type"] === "vk-connect") {
			const name = message["handler"];
			const params = message["params"];
			if (typeof name === "string" && isPlainObject(params)) {
				onOutgoing(name, params);
			}
		}
		return original(...args);
	};
	try {
		// A window method rebind, not a postMessage call — the rule is a
		// false positive here (the original receives the full arg list).
		// oxlint-disable-next-line unicorn/require-post-message-target-origin
		window.postMessage = wrapped as typeof window.postMessage;
	} catch {
		// the page froze the method — outgoing stays unreported
	}
}
