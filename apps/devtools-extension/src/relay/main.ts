/**
 * The MAIN-world relay — the react-devtools trick: a tiny dependency-free
 * script in the page world that reads `globalThis.__vkmaDevtoolsBridge`
 * (published by `@vkma.dev/bridge` at import time) and bridges it to the
 * isolated world over same-window postMessage. The channel name is
 * reserved (`__vkmaExt`); every payload is ignored by the bridge itself
 * (no vk-connect `type`), and nothing here is privileged — a page script
 * could fake relay messages, but it could equally emit that bridge traffic
 * itself, so no extension security boundary is crossed.
 */
import { RELAY_CHANNEL } from "@vkma.dev/protocol";
import type { TapEvent } from "@vkma.dev/protocol/schemas";

interface BridgeHandle {
	tap: {
		subscribe: (listener: (event: TapEvent) => void) => () => void;
	};
	send: (name: string, params?: Record<string, unknown>) => Promise<unknown>;
}

interface RelaySendRequest {
	channel: typeof RELAY_CHANNEL;
	kind: "send";
	execId: number;
	name: string;
	params?: Record<string, unknown>;
}

const post = (message: unknown) => {
	// Self-post within this frame; the host origin is irrelevant and opaque
	// origins must not throw. The payload stays in this frame's window.
	// oxlint-disable-next-line unicorn/require-post-message-target-origin
	window.postMessage(message, "*");
};

const hello = (found: boolean) => {
	post({ channel: RELAY_CHANNEL, kind: "hello", found });
};

function waitForBridge(timeoutMs: number): Promise<BridgeHandle | undefined> {
	const started = Date.now();
	return new Promise(resolve => {
		const poll = () => {
			const handle = (
				globalThis as typeof globalThis & { __vkmaDevtoolsBridge?: BridgeHandle }
			).__vkmaDevtoolsBridge;
			if (handle !== undefined) {
				resolve(handle);
				return;
			}
			if (Date.now() - started > timeoutMs) {
				resolve(undefined);
				return;
			}
			setTimeout(poll, 50);
		};
		poll();
	});
}

void (async () => {
	const handle = await waitForBridge(10_000);
	if (handle === undefined) {
		// The app does not run @vkma.dev/bridge — the collector stays in
		// spy mode (its own bridge instance + the host sniffer).
		hello(false);
		return;
	}

	hello(true);

	// The tap replays its buffer to the first subscriber, so app traffic
	// emitted before this script executed is not lost.
	handle.tap.subscribe(event => {
		post({ channel: RELAY_CHANNEL, kind: "event", event });
	});

	// Execute requests come from the isolated-world collector; the send
	// rides the app's OWN bridge instance — real transports, real pairing.
	window.addEventListener("message", (event: MessageEvent) => {
		const message = event.data as RelaySendRequest | undefined;
		if (
			message === null ||
			typeof message !== "object" ||
			message.channel !== RELAY_CHANNEL ||
			message.kind !== "send"
		) {
			return;
		}
		handle.send(message.name, message.params).then(
			payload =>
				post({
					channel: RELAY_CHANNEL,
					kind: "send-result",
					execId: message.execId,
					ok: true,
					payload,
				}),
			(error: unknown) =>
				post({
					channel: RELAY_CHANNEL,
					kind: "send-result",
					execId: message.execId,
					ok: false,
					payload:
						error instanceof Error
							? { name: error.name, message: error.message }
							: error,
				}),
		);
	});
})();
