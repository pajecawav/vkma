import { defineRpcFunction } from "devframe";
import { connectDevframe } from "devframe/client";
import { VKMA_RPC, type ClientInfo } from "../shared/protocol.ts";

/**
 * The inject collector: runs inside the mini app's page (loaded from
 * `/__vkma/inject.js` by the Vite plugin's `transformIndexHtml`). It finds
 * the app's bridge handle on `globalThis`, reports every tapped event to the
 * node side, answers execute requests routed to it, and mounts the FAB.
 */

interface TapEvent {
	id: number;
	ts: number;
	direction: "out" | "in";
	kind: "send" | "response" | "event";
	name: string;
	payload?: unknown;
	reqId?: number;
	ok?: boolean;
}

interface BridgeHandle {
	tap: {
		subscribe: (listener: (event: TapEvent) => void) => () => void;
	};
	send: (name: string, params?: Record<string, unknown>) => Promise<unknown>;
}

/**
 * The bridge module initializes `globalThis.__vkmaDevtoolsBridge` at import
 * time, but this script is dynamically inserted and may execute BEFORE the
 * app's module graph — so the handle can legitimately appear later. The
 * tap's replay buffer covers anything sent before we subscribe.
 */
async function waitForBridge(timeoutMs = 10_000): Promise<BridgeHandle | undefined> {
	const started = Date.now();
	for (;;) {
		const handle = (
			globalThis as typeof globalThis & {
				__vkmaDevtoolsBridge?: BridgeHandle;
			}
		).__vkmaDevtoolsBridge;
		if (handle !== undefined) {
			return handle;
		}
		if (Date.now() - started > timeoutMs) {
			return undefined;
		}
		await new Promise(resolve => setTimeout(resolve, 50));
	}
}

/**
 * The panel base. The Vite plugin sets `globalThis.__VKMA_DEVTOOLS_BASE__`
 * right before loading this module — deriving it from `import.meta.url` is
 * unreliable in dev pipelines that inline modules as data: URLs.
 */
const base =
	(globalThis as typeof globalThis & { __VKMA_DEVTOOLS_BASE__?: string })
		.__VKMA_DEVTOOLS_BASE__ ?? "/__vkma/";

const CLIENT_ID_KEY = "vkma:clientId";
const CLIENT_ID_CHANNEL = "vkma:client-ids";
const HEARTBEAT_MS = 5_000;
const FLUSH_MS = 250;
const CLAIM_WINDOW_MS = 180;
/** Heartbeats between client-id re-assertions (6 × 5s). */
const REASSERT_EVERY = 6;

function mintId(prefix: string): string {
	return (
		globalThis.crypto?.randomUUID?.() ??
		`${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
	);
}

function storeClientId(id: string): void {
	try {
		sessionStorage.setItem(CLIENT_ID_KEY, id);
	} catch {
		// storage denied — the id just lives for this page load
	}
}

function getOrCreateClientId(): string {
	try {
		const existing = sessionStorage.getItem(CLIENT_ID_KEY);
		if (existing) {
			return existing;
		}
		const id = mintId("c");
		storeClientId(id);
		return id;
	} catch {
		return mintId("c");
	}
}

function collectLaunchParams(): Record<string, string> {
	const params: Record<string, string> = {};
	for (const [key, value] of new URLSearchParams(window.location.search)) {
		if (key.startsWith("vk_") || key === "api_url" || key === "sign") {
			params[key] = value;
		}
	}
	return params;
}

let clientId = getOrCreateClientId();
/** Fresh on every page load — the node side wipes this client's history
 * when it sees a new session for a known client. */
const sessionId = mintId("s");
const launchParams = collectLaunchParams();

interface IdMessage {
	type: "claim" | "taken";
	id: string;
	token: string;
}

let reassertIds: (() => void) | undefined;
let retintFab: (() => void) | undefined;

/**
 * sessionStorage survives reloads but is copied by "Duplicate Tab"
 * (middle-click on the reload button, among others) — two live tabs then
 * share one client id, interleaving their traffic into a single card and
 * wiping its history every heartbeat (their sessionIds alternate). This
 * BroadcastChannel handshake resolves that: a tab may keep its id only
 * while it is the one live tab holding it. The claimant yields — an
 * incumbent answers `taken` and the claiming tab mints a fresh id — so a
 * plain reload (nobody else holds the id) keeps its id. Tabs re-assert
 * their claim periodically, which also settles a duplicate whose twin was
 * timer-frozen at claim time.
 */
function watchClientIds(): (() => void) | undefined {
	if (typeof BroadcastChannel === "undefined") {
		return undefined;
	}
	const channel = new BroadcastChannel(CLIENT_ID_CHANNEL);
	const token = mintId("t");

	const regenerate = () => {
		clientId = mintId("c");
		storeClientId(clientId);
		// the glyph color is derived from the id — re-tint it too
		retintFab?.();
		// re-register right away so the next flush is not dropped as
		// traffic from an unknown client
		if (current !== undefined) {
			current.rpc.callEvent(VKMA_RPC.hello, clientInfo());
		}
	};

	const claim = () => {
		channel.postMessage({ type: "claim", id: clientId, token });
	};

	channel.onmessage = (event: MessageEvent<IdMessage | undefined>) => {
		const message = event.data;
		if (!message) {
			return;
		}
		if (message.type === "claim") {
			// BroadcastChannel never echoes to its own poster, so a claim
			// carrying my token cannot happen — and a claim of my id by
			// another tab means the claimant yields, I keep it.
			if (message.token !== token && message.id === clientId) {
				channel.postMessage({ type: "taken", id: message.id, token: message.token });
			}
			return;
		}
		if (
			message.type === "taken" &&
			message.token === token && // addressed to my claim
			message.id === clientId
		) {
			// my claim lost — mint a fresh id and verify that one is unclaimed
			regenerate();
			claim();
		}
	};

	claim();
	return claim;
}

function detectPlatform(): ClientInfo["platform"] {
	const inFrame = window.self !== window.top;
	const mobile =
		launchParams["vk_platform"] === "mobile_web" ||
		/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
	if (!launchParams["vk_app_id"] && !inFrame) {
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

const platform = detectPlatform();
let bridgeGlobal: BridgeHandle | undefined;

/** When this page load connected — stable across heartbeats, the node side
 * sorts the registry (and shows "connected N ago") by it. */
const connectedAt = Date.now();

function clientInfo(): ClientInfo {
	const now = Date.now();
	return {
		clientId,
		sessionId,
		connectedAt,
		lastSeenAt: now,
		ua: navigator.userAgent,
		url: window.location.href,
		platform,
		bridge: bridgeGlobal !== undefined,
		appId: launchParams["vk_app_id"],
		launchParams,
	};
}

type RpcClient = Awaited<ReturnType<typeof connectDevframe>>;

/** A `vkma`-scoped client: auto-prefixed ids, its own rpc surface. */
function scopeVkma(rpc: RpcClient) {
	return rpc.scope("vkma");
}
type ScopedClient = ReturnType<typeof scopeVkma>;

const clientExecute = defineRpcFunction({
	// bare name — the scope prefixes it to `vkma:client-execute`
	name: VKMA_RPC.clientExecute.slice("vkma:".length),
	type: "event",
	handler: (payload: {
		execId: number;
		clientId: string;
		name: string;
		params?: Record<string, unknown>;
	}) => {
		if (payload.clientId !== clientId) {
			return;
		}
		executeOnApp(payload);
	},
});

let current: ScopedClient | undefined;
let queue: TapEvent[] = [];
let reconnectDelay = 500;
let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

function flush(): void {
	if (current === undefined || queue.length === 0) {
		return;
	}
	const events = queue;
	queue = [];
	current.rpc.callEvent(VKMA_RPC.events, { clientId, events });
}

function executeOnApp(payload: {
	execId: number;
	name: string;
	params?: Record<string, unknown>;
}): void {
	const report = (ok: boolean, result: unknown) => {
		current?.rpc.callEvent(VKMA_RPC.execResult, {
			execId: payload.execId,
			clientId,
			ok,
			payload: result,
		});
	};
	if (!bridgeGlobal) {
		report(false, { error: "bridge not detected on this page" });
		return;
	}
	bridgeGlobal.send(payload.name, payload.params).then(
		result => report(true, result),
		(error: unknown) =>
			report(
				false,
				error instanceof Error ? { name: error.name, message: error.message } : error,
			),
	);
}

async function connect(): Promise<void> {
	const client = await connectDevframe({ baseURL: base });
	const scoped = scopeVkma(client);
	current = scoped;

	scoped.rpc.register(clientExecute as never);
	scoped.rpc.callEvent(VKMA_RPC.hello, clientInfo());
	flush();
	reconnectDelay = 500;

	client.events.on("connection:status", (status: string) => {
		if (status === "disconnected" || status === "error") {
			current = undefined;
			scheduleReconnect();
		}
	});
}

function scheduleReconnect(): void {
	if (reconnectTimer !== undefined) {
		return;
	}
	reconnectTimer = setTimeout(() => {
		reconnectTimer = undefined;
		connect().catch((error: unknown) => {
			console.warn("[vkma] collector reconnect failed:", error);
			scheduleReconnect();
		});
	}, reconnectDelay);
	reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
}

async function main(): Promise<void> {
	reassertIds = watchClientIds();
	const [handle] = await Promise.all([
		waitForBridge(),
		// give the claim handshake its window before the first hello, so a
		// duplicated tab registers under its fresh id right away
		reassertIds !== undefined
			? new Promise<void>(resolve => setTimeout(resolve, CLAIM_WINDOW_MS))
			: Promise.resolve(),
	]);
	bridgeGlobal = handle;

	if (bridgeGlobal) {
		// The tap replays its buffer to the first subscriber, so events the
		// app emitted before this script executed are not lost. `vk-connect`
		// is vk-bridge's own transport chatter, not VK semantics — skip it.
		bridgeGlobal.tap.subscribe(event => {
			if (event.name === "vk-connect") {
				return;
			}
			queue.push(event);
		});
	} else {
		console.info(
			"[vkma] bridge not detected — import @vkma.dev/bridge instead of @vkontakte/vk-bridge to capture events",
		);
	}

	await connect();
}

void main().catch((error: unknown) => {
	console.warn("[vkma] collector failed:", error);
	scheduleReconnect();
});

// Heartbeat + batched flush share one tick each.
let heartbeatTicks = 0;
setInterval(() => {
	heartbeatTicks++;
	if (reassertIds !== undefined && heartbeatTicks % REASSERT_EVERY === 0) {
		// a frozen twin may have answered nothing at claim time — re-check
		reassertIds();
	}
	if (current !== undefined) {
		current.rpc.callEvent(VKMA_RPC.hello, clientInfo());
	}
}, HEARTBEAT_MS);
setInterval(flush, FLUSH_MS);

// Chrome throttles timers in background tabs, so on focus say hello right
// away instead of waiting for the next tick (the node flips the client
// back online immediately).
document.addEventListener("visibilitychange", () => {
	if (document.visibilityState === "visible") {
		if (current !== undefined) {
			current.rpc.callEvent(VKMA_RPC.hello, clientInfo());
		}
		flush();
	}
});

void import("./fab.ts").then(({ mountFab }) => {
	retintFab = mountFab({ base, getClientId: () => clientId });
});
