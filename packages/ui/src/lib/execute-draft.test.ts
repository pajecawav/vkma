import type { ClientStatus } from "@vkma.dev/protocol";
import { describe, expect, test } from "vitest";
import {
	EMPTY_EXECUTE_DRAFT,
	EMPTY_PARAMS,
	EXECUTE_DRAFT_STORAGE_KEY,
	executeDraftKey,
	parseExecuteDraft,
	resolveExecuteTarget,
	sameExecuteDraft,
	settleOwnWrite,
} from "./execute-draft.ts";

/** A realistic frame url: the launch params and the route may differ
 * after a reload, the path is what stays. */
const PAGE = "https://app.example.com/web/?vk_app_id=1&sign=OLD#/";
const OTHER = "https://other.example.com/index.html";

function client(overrides: Partial<ClientStatus> = {}): ClientStatus {
	return {
		clientId: "c-1",
		sessionId: "s-1",
		connectedAt: 0,
		lastSeenAt: 0,
		ua: "Mozilla/5.0",
		url: PAGE,
		platform: "desktop-web",
		bridge: true,
		online: true,
		...overrides,
	};
}

const empty = () => ({ ...EMPTY_EXECUTE_DRAFT });

describe("executeDraftKey", () => {
	test("one entry per tab, and the bare key where the jar is already one per tab", () => {
		expect(executeDraftKey(7)).toBe("vkma:execute-draft:7");
		expect(executeDraftKey(8)).not.toBe(executeDraftKey(7));
		expect(executeDraftKey()).toBe(EXECUTE_DRAFT_STORAGE_KEY);
	});
});

describe("parseExecuteDraft", () => {
	test("anything unexpected degrades to the empty draft", () => {
		expect(parseExecuteDraft(undefined)).toStrictEqual(empty());
		expect(parseExecuteDraft(null)).toStrictEqual(empty());
		expect(parseExecuteDraft("{not json")).toStrictEqual(empty());
		expect(parseExecuteDraft("[]")).toStrictEqual(empty());
		expect(parseExecuteDraft({ v: 2, name: "VKWebAppInit" })).toStrictEqual(empty());
	});

	test("a corrupt field falls back on its own, the rest survives", () => {
		expect(
			parseExecuteDraft({ v: 1, target: 42, name: "VKWebAppInit", paramsText: { no: 1 } }),
		).toStrictEqual({ v: 1, target: "", name: "VKWebAppInit", paramsText: EMPTY_PARAMS });
	});

	test("reads both storage shapes: a JSON string and a parsed value", () => {
		const stored = {
			v: 1,
			target: "c-1",
			targetUrl: PAGE,
			name: "VKWebAppGetUserInfo",
			paramsText: '{\n  "user_id": 0\n}',
			lastAutoFill: '{\n  "user_id": 0\n}',
		};
		expect(parseExecuteDraft(JSON.stringify(stored))).toStrictEqual(stored);
		expect(parseExecuteDraft(stored)).toStrictEqual(stored);
	});

	test("a cleared Params field stays cleared; empty optional keys are absent", () => {
		const parsed = parseExecuteDraft({
			v: 1,
			name: "",
			paramsText: "",
			targetUrl: "",
			lastAutoFill: "",
		});
		expect(parsed).toStrictEqual({ v: 1, target: "", name: "", paramsText: "" });
	});

	test("survives the storage round trip: JSON drops undefined keys", () => {
		const written = parseExecuteDraft({
			v: 1,
			target: "c-1",
			targetUrl: undefined,
			name: "VKWebAppInit",
			paramsText: "",
			lastAutoFill: undefined,
		});
		const read = parseExecuteDraft(JSON.parse(JSON.stringify(written)));
		expect(read).toStrictEqual(written);
		expect(sameExecuteDraft(read, written)).toBe(true);
	});
});

describe("sameExecuteDraft", () => {
	const base = parseExecuteDraft({ v: 1, name: "A", paramsText: "{}" });

	test("two drafts with the same fields are the same draft", () => {
		expect(
			sameExecuteDraft(base, parseExecuteDraft({ v: 1, name: "A", paramsText: "{}" })),
		).toBe(true);
	});

	test("one differing field tells them apart", () => {
		expect(
			sameExecuteDraft(base, parseExecuteDraft({ v: 1, name: "B", paramsText: "{}" })),
		).toBe(false);
		expect(
			sameExecuteDraft(base, parseExecuteDraft({ v: 1, name: "A", paramsText: "{ }" })),
		).toBe(false);
		expect(
			sameExecuteDraft(
				base,
				parseExecuteDraft({ v: 1, target: "c-1", name: "A", paramsText: "{}" }),
			),
		).toBe(false);
		expect(
			sameExecuteDraft(
				base,
				parseExecuteDraft({ v: 1, name: "A", paramsText: "{}", lastAutoFill: "{}" }),
			),
		).toBe(false);
	});
});

describe("resolveExecuteTarget", () => {
	test("a listed target is honored", () => {
		const clients = [client({ clientId: "c-1" }), client({ clientId: "c-2", url: OTHER })];
		expect(resolveExecuteTarget(clients, "c-1", undefined)).toBe("c-1");
	});

	test("nothing picked, or a dead id without a page: the newest online client", () => {
		// registry order: online first, oldest → newest
		const clients = [
			client({ clientId: "old", online: true }),
			client({ clientId: "newest", online: true }),
		];
		expect(resolveExecuteTarget(clients, "", undefined)).toBe("newest");
		expect(resolveExecuteTarget(clients, "dead", undefined)).toBe("newest");
	});

	test("with everyone offline the newest entry is still the default", () => {
		const clients = [
			client({ clientId: "old", online: false }),
			client({ clientId: "newest", online: false }),
		];
		expect(resolveExecuteTarget(clients, "", undefined)).toBe("newest");
	});

	test("a dead target follows its page to the reloaded client, not to the newest", () => {
		const clients = [
			client({ clientId: "reloaded" }),
			client({ clientId: "other", url: OTHER }),
		];
		expect(resolveExecuteTarget(clients, "dead", PAGE)).toBe("reloaded");
		// without the page the newest client would have taken the send
		expect(resolveExecuteTarget(clients, "dead", undefined)).toBe("other");
	});

	test("the page matches without the query and the hash, but needs the path", () => {
		const reloaded = client({
			clientId: "reloaded",
			url: "https://app.example.com/web/?sign=NEW",
		});
		const clients = [reloaded, client({ clientId: "other", url: OTHER })];
		expect(
			resolveExecuteTarget(clients, "dead", "https://app.example.com/web/?sign=OLD#/home"),
		).toBe("reloaded");
		expect(
			resolveExecuteTarget(clients, "dead", "https://app.example.com/elsewhere/?sign=OLD"),
		).toBe("other");
		expect(resolveExecuteTarget(clients, "dead", "https://evil.example.com/web/")).toBe(
			"other",
		);
	});

	test("among several frames of the same page, the newest online one", () => {
		const page = { url: PAGE };
		const clients = [
			client({ clientId: "a", ...page, online: false }),
			client({ clientId: "b", ...page, online: true }),
		];
		expect(resolveExecuteTarget(clients, "dead", PAGE)).toBe("b");
		const allOffline = [
			client({ clientId: "a", ...page, online: false }),
			client({ clientId: "b", ...page, online: false }),
		];
		expect(resolveExecuteTarget(allOffline, "dead", PAGE)).toBe("b");
	});

	test("no clients, or an unparsable page: no target, never a throw", () => {
		expect(resolveExecuteTarget([], "dead", PAGE)).toBe("");
		expect(resolveExecuteTarget([client({ url: "" })], "dead", "not a url")).toBe("c-1");
	});
});

describe("settleOwnWrite", () => {
	const draft = (paramsText: string) => parseExecuteDraft({ v: 1, name: "A", paramsText });

	test("each own echo settles its save, in write order", () => {
		const owed = [draft("a"), draft("ab")];
		expect(settleOwnWrite(owed, draft("a"))).toBe(true);
		expect(owed).toStrictEqual([draft("ab")]);
		expect(settleOwnWrite(owed, draft("ab"))).toBe(true);
		expect(owed).toStrictEqual([]);
	});

	test("a stale echo never rolls the field back: the state is already ahead", () => {
		// "a" was written, then "ab" was typed before "a"'s echo arrived
		const owed = [draft("a"), draft("ab")];
		expect(settleOwnWrite(owed, draft("a"))).toBe(true);
		expect(owed).toStrictEqual([draft("ab")]);
	});

	test("another surface's save is not an echo and leaves the ledger alone", () => {
		const owed = [draft("a")];
		expect(settleOwnWrite(owed, draft("theirs"))).toBe(false);
		expect(owed).toStrictEqual([draft("a")]);
	});

	test("an echo that skipped ahead (a lost or coalesced one) settles up to itself", () => {
		const owed = [draft("a"), draft("ab"), draft("abc")];
		expect(settleOwnWrite(owed, draft("abc"))).toBe(true);
		expect(owed).toStrictEqual([]);
	});

	test("nothing owed: every change is someone else's", () => {
		expect(settleOwnWrite([], draft("a"))).toBe(false);
	});
});
