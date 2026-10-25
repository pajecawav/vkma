/**
 * The frame collector — the extension's counterpart of the devtools inject
 * collector, running in the ISOLATED world of every mini app frame. Two
 * capture modes (see CaptureMode in @vkma.dev/protocol):
 *
 * - direct: the page runs `@vkma.dev/bridge`; the MAIN-world relay
 *   forwards its tap (replay-buffered, request-paired) and executes ride
 *   the app's own bridge instance through the relay.
 * - spy: a foreign bridge (`@vkontakte/vk-bridge` in prod or third-party
 *   apps). A second `@vkma.dev/bridge` instance lives here in the
 *   isolated world — `message` events reach listeners of every world, so
 *   it sees everything the host sends INTO the frame; the app's outgoing
 *   requests are sniffed by the host script. Execute sends through this
 *   own instance with a reserved request_id prefix.
 */
import { createVKBridge } from "@vkma.dev/bridge";
import type { ClientInfo } from "@vkma.dev/protocol";
import {
	RELAY_CHANNEL,
	type TapEvent,
	relayEventMessageSchema,
	relayHelloMessageSchema,
	relaySendResultSchema,
} from "@vkma.dev/protocol/schemas";
import { createClient } from "werpc";

const FLUSH_MS = 250;
const HEARTBEAT_MS = 5_000;
const EXT_REQUEST_ID_PREFIX = "__vkma_ext_";
/** The relay's bridge-detection window; matches the devtools collector. */
const BRIDGE_WAIT_MS = 10_000;

const params = new URLSearchParams(window.location.search);
const framed = window !== window.top;
const looksLikeMiniApp = params.has("sign") || params.has("vk_app_id") || params.has("vk_platform");

if (framed && looksLikeMiniApp) {
	void main();
}

function launchParams(): Record<string, string> {
	const collected: Record<string, string> = {};
	for (const [key, value] of params) {
		if (key.startsWith("vk_") || key === "api_url" || key === "sign") {
			collected[key] = value;
		}
	}
	return collected;
}

function mintId(prefix: string): string {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
	);
}

async function main(): Promise<void> {
	const startedAt = Date.now();
	// Page-load identity: the extension's history is per page load anyway,
	// and persisting across reloads would collide between same-origin
	// sibling frames (they share the tab's sessionStorage for the origin).
	const clientId = mintId("x");
	const sessionId = mintId("s");

	// The spy-mode bridge instance: its own tap (replay-buffered until we
	// subscribe), request ids namespaced so the host sniffer can tell the
	// collector's sends from the app's.
	const bridge = createVKBridge("vkma-devtools-extension", {
		requestId: { generator: sequence => `${EXT_REQUEST_ID_PREFIX}${sequence}` },
	});

	let mode: "direct" | "spy" = "spy";
	let webFrameId: string | undefined;

	// The host assigns the frame id over VKWebAppSettings — our bridge
	// caches it for its own sends, but never reports it; grab it raw so the
	// host can join sniffed envelopes to this collector.
	window.addEventListener("message", event => {
		const data = event.data as { type?: unknown; frameId?: unknown } | undefined;
		if (data?.type === "VKWebAppSettings" && typeof data.frameId === "string") {
			webFrameId = data.frameId;
		}
	});

	const client = createClient({ clientName: "frame", scopeToTab: true });

	// ---------------------------------------------------------------- relay

	const pendingSends = new Map<number, (report: { ok: boolean; payload?: unknown }) => void>();
	let queue: TapEvent[] = [];

	window.addEventListener("message", event => {
		const data: unknown = event.data;
		if (typeof data !== "object" || data === null) {
			return;
		}
		const channel = (data as { channel?: unknown }).channel;
		if (channel !== RELAY_CHANNEL) {
			return;
		}
		const kind = (data as { kind?: unknown }).kind;

		if (kind === "hello") {
			const parsed = relayHelloMessageSchema.safeParse(data);
			if (parsed.success && parsed.data.found && mode !== "direct") {
				mode = "direct";
				// The direct tap is authoritative from here on; re-register so
				// the store stops double-counting sniffed envelopes.
				void hello().catch(() => {});
			}
			return;
		}
		if (kind === "event") {
			const parsed = relayEventMessageSchema.safeParse(data);
			if (parsed.success && mode === "direct") {
				queue.push(parsed.data.event);
			}
			return;
		}
		if (kind === "send-result") {
			const parsed = relaySendResultSchema.safeParse(data);
			const settle = parsed.success ? pendingSends.get(parsed.data.execId) : undefined;
			if (parsed.success && settle) {
				pendingSends.delete(parsed.data.execId);
				settle({ ok: parsed.data.ok, payload: parsed.data.payload });
			}
		}
	});

	// ----------------------------------------------------------------- host

	function clientInfo(): ClientInfo {
		return {
			clientId,
			sessionId,
			connectedAt: startedAt,
			lastSeenAt: Date.now(),
			ua: navigator.userAgent,
			url: window.location.href,
			platform: params.get("vk_platform") === "mobile_web" ? "mobile-web" : "iframe",
			bridge: mode === "direct",
			appId: params.get("vk_app_id") ?? undefined,
			launchParams: launchParams(),
		};
	}

	async function hello(): Promise<void> {
		await client.vkma.hello.mutate({
			info: clientInfo(),
			webFrameId,
			origin: window.location.origin,
		});
	}

	function flush(): void {
		if (queue.length === 0) {
			return;
		}
		const events = queue;
		queue = [];
		void client.vkma.push.mutate({ clientId, events }).catch(() => {
			// the host died with the page — nothing to recover into
		});
	}

	// Spy mode: our own instance's tap sees host → app traffic; in direct
	// mode the relay's stream replaces it (the tap would duplicate).
	bridge.tap.subscribe(event => {
		if (mode === "spy") {
			queue.push(event);
		}
	});

	// Executes arrive as subscription pushes routed by clientId — direct
	// sends go through the relay (the app's own instance), spy sends
	// through ours.
	client.vkma.executeRequests.subscribe(undefined, {
		onData: request => {
			if (request.clientId !== clientId) {
				return;
			}
			const report = (ok: boolean, payload: unknown) => {
				void client.vkma.execResult
					.mutate({ execId: request.execId, clientId, ok, payload })
					.catch(() => {});
			};
			if (mode === "direct") {
				const execId = request.execId;
				pendingSends.set(execId, result => report(result.ok, result.payload));
				// oxlint-disable-next-line unicorn/require-post-message-target-origin
				window.postMessage(
					{
						channel: RELAY_CHANNEL,
						kind: "send",
						execId,
						name: request.name,
						params: request.params,
					},
					"*",
				);
				return;
			}
			bridge.send(request.name as never, request.params as never).then(
				payload => report(true, payload),
				(error: unknown) =>
					report(
						false,
						error instanceof Error
							? { name: error.name, message: error.message }
							: error,
					),
			);
		},
	});

	await hello();
	flush();

	// The relay may legitimately resolve after us (the app imports its
	// bridge dynamically) — after the wait, spy mode is final.
	setTimeout(() => {
		if (mode === "spy") {
			bridge.tap.drain(); // the replay buffer is meaningless now
		}
	}, BRIDGE_WAIT_MS);

	setInterval(() => {
		void hello().catch(() => {});
	}, HEARTBEAT_MS);
	setInterval(flush, FLUSH_MS);

	// Chrome throttles background-tab timers — on focus say hello right
	// away so the registry flips back online immediately.
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") {
			void hello().catch(() => {});
			flush();
		}
	});
}
