import { createVKBridge } from "@vkma.dev/bridge";
import type { TapEvent } from "@vkma.dev/protocol/schemas";
import { BRIDGE_WAIT_MS, FLUSH_MS, HEARTBEAT_MS } from "../shared/config.ts";
import {
	EXECUTE_REQUEST_ID_PREFIX,
	PROTOCOL_VERSION,
	type InspectExecuteMessage,
} from "../shared/protocol.ts";
import { eventBatches } from "./batches.ts";
import type { BridgeHandle } from "./capture/index.ts";
import { InspectorCapture } from "./capture/index.ts";
import { DialTrust } from "./dial-trust.ts";
import { claimWindow, createIdentity } from "./identity.ts";
import { peerIdFromUrl, resolveInspectorSourceUrl, signingKeyFromUrl } from "./own-url.ts";
import { InspectorTransport } from "./transport.ts";

/**
 * inspector.js — the standalone collector injected into a mini app page
 * (script tag first in <head>, or a console import()). Idempotent, and
 * it must never break the host page: every hook forwards first and
 * reports second.
 */

const GUARD = "__vkmaInspectLoaded";

const global = globalThis as typeof globalThis & { [GUARD]?: boolean };
if (!global[GUARD]) {
	global[GUARD] = true;
	void main();
}

async function main(): Promise<void> {
	const sourceUrl = resolveInspectorSourceUrl();
	const targetId = sourceUrl !== undefined ? peerIdFromUrl(sourceUrl) : undefined;
	if (targetId === undefined) {
		console.error(
			"[vkma-inspect] no ?id=<peer id> in the inspector URL — copy the snippet from the inspect panel",
		);
		return;
	}
	// The panel's public key rides the snippet (`k=`): the answering
	// peer must sign our challenge before anything sensitive ships.
	const verifyKey = sourceUrl !== undefined ? signingKeyFromUrl(sourceUrl) : undefined;

	// Hooks go in BEFORE anything else: the app's bridge module may be
	// the very next script tag, and it freezes transport refs at import.
	const capture = new InspectorCapture();
	const identity = createIdentity(() => {
		// a duplicate tab lost the client-id claim — re-register at once
		sayHello();
	});

	// The private execute bridge: request ids carry the reserved prefix,
	// so the raw capture layers never double-report its sends.
	const bridge = createVKBridge("vkma-inspect", {
		requestId: { generator: sequence => `${EXECUTE_REQUEST_ID_PREFIX}${sequence}` },
	});
	capture.hookSpyBridge({
		tap: bridge.tap,
		// The catalogue keys the public send; executes arrive as plain
		// strings off the wire — the structural cast mirrors the extension
		// collector's `request.name as never`.
		send: (name, params) => bridge.send(name as never, params as never),
	});

	const queue: TapEvent[] = [];
	const flush = (): void => {
		if (queue.length === 0) {
			return;
		}
		// Chunk to the wire bound — the host silently drops whole batches
		// over it, so one giant splice would blind the timeline.
		for (const batch of eventBatches(queue.splice(0), identity.clientId)) {
			link.enqueue(batch);
		}
	};

	// The dial-direction gate: challenge first, credentials only after
	// the answering peer proves it holds the panel's signing key.
	const link = new DialTrust(verifyKey, {
		send: message => transport.send(message),
		isOpen: () => transport.isOpen(),
		drop: () => transport.drop(),
		onVerified: () => {
			sayHello();
			flush();
		},
		onExecute: request => {
			void execute(request);
		},
	});

	const transport = new InspectorTransport(targetId, {
		onOpen: () => {
			link.channelOpened();
		},
		onMessage: message => {
			link.onMessage(message);
		},
		onDown: () => {
			link.channelClosed();
		},
	});

	const sayHello = (): void =>
		link.enqueue({
			v: PROTOCOL_VERSION,
			t: "hello",
			info: identity.clientInfo(capture.mode === "direct"),
		});

	async function execute(request: InspectExecuteMessage): Promise<void> {
		const report = (ok: boolean, payload: unknown) =>
			link.enqueue({
				v: PROTOCOL_VERSION,
				t: "exec-result",
				execId: request.execId,
				clientId: identity.clientId,
				ok,
				payload,
			});
		try {
			report(true, await capture.execute(request.name, request.params));
		} catch (error: unknown) {
			report(
				false,
				error instanceof Error ? { name: error.name, message: error.message } : error,
			);
		}
	}

	transport.start();

	// The direct-handle question settles while the dial is in flight;
	// whatever the hooks captured meanwhile flushes once spy is final.
	const handle = await waitForBridge();
	capture.finalize(handle, event => queue.push(event));
	if (handle === undefined) {
		console.info(
			"[vkma-inspect] spy mode — no @vkma.dev/bridge on this page, capturing the native bridge / page listeners",
		);
	}

	// Give the duplicate-tab claim handshake its window before the first
	// hello, so a regenerated id registers under itself right away.
	await claimWindow();
	sayHello();
	flush();

	// Heartbeat + batched flush + instant re-hello on focus (the panel's
	// registry flips offline on throttled background timers otherwise).
	let heartbeats = 0;
	setInterval(() => {
		heartbeats++;
		if (heartbeats % 6 === 0) {
			identity.reassertClaim(); // a frozen twin may answer late
		}
		sayHello();
	}, HEARTBEAT_MS);
	setInterval(flush, FLUSH_MS);
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "visible") {
			sayHello();
			flush();
		}
	});
}

/**
 * The bridge module initializes `globalThis.__vkmaDevtoolsBridge` at
 * import time, but the app may import it later than this script — the
 * handle can legitimately appear for up to BRIDGE_WAIT_MS. The tap's
 * replay buffer covers anything sent before we subscribe.
 *
 * The global is page-writable and first-writer-wins, so presence alone
 * proves nothing: only a handle shaped like a genuine @vkma.dev/bridge
 * tap (subscribe + emit + drain, drain returning rows) is adopted. This
 * raises the bar for page-planted fakes — and combined with finalize
 * never muting the raw layers, a mimic can add rows but cannot blind
 * the independent capture.
 */
async function waitForBridge(timeoutMs = BRIDGE_WAIT_MS): Promise<BridgeHandle | undefined> {
	const started = Date.now();
	for (;;) {
		const handle = (globalThis as typeof globalThis & { __vkmaDevtoolsBridge?: unknown })
			.__vkmaDevtoolsBridge;
		if (handle !== undefined && looksLikeGenuineHandle(handle)) {
			return handle;
		}
		if (Date.now() - started > timeoutMs) {
			return undefined;
		}
		await new Promise(resolve => setTimeout(resolve, 50));
	}
}

/** Structural check against the genuine @vkma.dev/bridge publication
 * (packages/bridge tap: subscribe/emit/drain, drain returning rows). */
function looksLikeGenuineHandle(handle: unknown): handle is BridgeHandle {
	if (typeof handle !== "object" || handle === null) {
		return false;
	}
	const tap = (handle as { tap?: unknown }).tap;
	if (typeof tap !== "object" || tap === null) {
		return false;
	}
	const { subscribe, emit, drain } = tap as Record<string, unknown>;
	if (
		typeof subscribe !== "function" ||
		typeof emit !== "function" ||
		typeof drain !== "function"
	) {
		return false;
	}
	try {
		return Array.isArray((drain as () => unknown)());
	} catch {
		return false;
	}
}
