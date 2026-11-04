import { describe, expect, it } from "vitest";
import type { BridgeEventEnvelope } from "./bridge-like.ts";
import { createBridgeSync } from "./bridge-sync.ts";

/**
 * Fake-transport coverage of the host↔app location contract (the mobile
 * webview paths. The web iframe speaks the same envelope).
 */

interface Harness {
	sent: Array<{ type: string; data: unknown }>;
	replaced: string[];
	/** Simulate the host pushing a bridge event into the app. */
	hostEvent(type: string, data?: unknown): void;
	/** Simulate the app committing a history change. */
	commit(pathname: string, search?: string, hash?: string): void;
	destroy(): void;
}

const make = (codecs?: {
	serializePayload?: Parameters<typeof createBridgeSync>[0]["serializePayload"];
	parsePayload?: Parameters<typeof createBridgeSync>[0]["parsePayload"];
}): Harness => {
	const sent: Array<{ type: string; data: unknown }> = [];
	const replaced: string[] = [];
	let hostHandler: ((event: BridgeEventEnvelope) => void) | null = null;
	let historyListener:
		| ((event: { location: { pathname: string; search: string; hash: string } }) => void)
		| null = null;
	const location = { pathname: "/start", search: "", hash: "" };
	const sync = createBridgeSync({
		bridge: {
			send: async (type, data) => {
				sent.push({ type, data });
				return { result: true };
			},
			subscribe: handler => {
				hostHandler = handler;
				return () => {
					hostHandler = null;
				};
			},
		},
		history: {
			location,
			subscribe: listener => {
				historyListener = listener;
				return () => {
					historyListener = null;
				};
			},
			replace: path => {
				replaced.push(path);
			},
		},
		...codecs,
	});
	return {
		sent,
		replaced,
		hostEvent(type, data) {
			hostHandler?.({ type, data });
		},
		commit(pathname, search = "", hash = "") {
			location.pathname = pathname;
			location.search = search;
			location.hash = hash;
			historyListener?.({ location });
		},
		destroy: () => sync.destroy(),
	};
};

describe("bridge sync (fake transports)", () => {
	it("sends the initial location once, replace_state semantics", () => {
		const h = make();
		expect(h.sent).toStrictEqual([
			{ type: "VKWebAppSetLocation", data: { location: "/start", replace_state: true } },
		]);
	});

	it("sends every committed location change from the EVENT's location", () => {
		const h = make();
		h.commit("/feed", "?tab=x", "#frag");
		expect(h.sent.at(-1)?.data).toStrictEqual({
			location: "/feed?tab=x#frag",
			replace_state: true,
		});
	});

	it("does not re-send an unchanged payload", () => {
		const h = make();
		h.commit("/feed");
		h.commit("/feed", "", "#anchor");
		// hash-mode payload is path+search only. A fragment-only change is
		// invisible to the host
		expect(
			h.sent.filter(
				event => event.data && (event.data as { location: string }).location === "/feed",
			),
		).toHaveLength(1);
	});

	it("host-initiated ChangeFragment replaces the history entry", () => {
		const h = make();
		h.hostEvent("VKWebAppChangeFragment", { location: "/item/7" });
		expect(h.replaced).toStrictEqual(["/item/7"]);
	});

	it("VKWebAppLocationChanged is a host jump too", () => {
		const h = make();
		h.hostEvent("VKWebAppLocationChanged", { location: "/list" });
		expect(h.replaced).toStrictEqual(["/list"]);
	});

	it("ignores the echo of our own location (loop protection)", () => {
		const h = make();
		h.hostEvent("VKWebAppChangeFragment", { location: "/start" });
		expect(h.replaced).toStrictEqual([]);
	});

	it("ignores foreign bridge events and empty payloads", () => {
		const h = make();
		h.hostEvent("VKWebAppViewRestore");
		h.hostEvent("VKWebAppChangeFragment");
		expect(h.replaced).toStrictEqual([]);
	});

	it("hash-param codecs ride through the custom serialize/parse", () => {
		const h = make({
			serializePayload: location =>
				`#?path=${encodeURIComponent(`${location.pathname}${location.search}`)}`,
			parsePayload: payload =>
				new URLSearchParams(payload.replace(/^#\?/, "")).get("path") ?? "/",
		});
		// initial payload keeps foreign params next to the path
		expect(h.sent[0]?.data).toStrictEqual({
			location: "#?path=%2Fstart",
			replace_state: true,
		});
		h.hostEvent("VKWebAppChangeFragment", { location: "#?path=%2Fitem%2F7&utm=x" });
		expect(h.replaced).toStrictEqual(["/item/7"]);
	});

	it("destroy unsubscribes from both sides", () => {
		const h = make();
		h.destroy();
		const count = h.sent.length;
		h.commit("/after-destroy");
		h.hostEvent("VKWebAppChangeFragment", { location: "/elsewhere" });
		expect(h.sent).toHaveLength(count);
		expect(h.replaced).toStrictEqual([]);
	});
});
