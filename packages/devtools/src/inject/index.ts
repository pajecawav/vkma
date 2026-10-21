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

const bridgeGlobal = (globalThis as typeof globalThis & { __vkmaDevtoolsBridge?: BridgeHandle })
	.__vkmaDevtoolsBridge;

/** The panel base, derived from this script's own URL (`<base>inject.js`). */
const base = new URL(".", import.meta.url).href;

const CLIENT_ID_KEY = "vkma:clientId";
const HEARTBEAT_MS = 5_000;
const FLUSH_MS = 250;

function getOrCreateClientId(): string {
	const fallback = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	try {
		const existing = sessionStorage.getItem(CLIENT_ID_KEY);
		if (existing) {
			return existing;
		}
		const id = globalThis.crypto?.randomUUID?.() ?? fallback();
		sessionStorage.setItem(CLIENT_ID_KEY, id);
		return id;
	} catch {
		return fallback();
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

const clientId = getOrCreateClientId();
const launchParams = collectLaunchParams();

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

function clientInfo(): ClientInfo {
	const now = Date.now();
	return {
		clientId,
		connectedAt: now,
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
		connect().catch(() => scheduleReconnect());
	}, reconnectDelay);
	reconnectDelay = Math.min(reconnectDelay * 2, 10_000);
}

if (bridgeGlobal) {
	// The tap replays its buffer to the first subscriber, so events emitted
	// before this script loaded (module evaluation order) are not lost.
	bridgeGlobal.tap.subscribe(event => {
		queue.push(event);
	});
} else {
	console.info(
		"[vkma] bridge not detected — import @vkma.dev/bridge instead of @vkontakte/vk-bridge to capture events",
	);
}

connect().catch(() => scheduleReconnect());

// Heartbeat + batched flush share one tick each.
setInterval(() => {
	if (current !== undefined) {
		current.rpc.callEvent(VKMA_RPC.hello, clientInfo());
	}
}, HEARTBEAT_MS);
setInterval(flush, FLUSH_MS);

void import("./fab.ts").then(({ mountFab }) => {
	mountFab({ base });
});
