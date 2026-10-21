import { expect, test } from "vitest";
import { createTap, type BridgeTapEvent } from "./tap.ts";

test("buffers events until the first subscriber attaches, then replays them", () => {
	const tap = createTap();
	tap.emit({ direction: "out", kind: "send", name: "VKWebAppInit" });
	tap.emit({ direction: "in", kind: "event", name: "VKWebAppUpdateConfig" });

	const seen: BridgeTapEvent[] = [];
	tap.subscribe(event => seen.push(event));

	expect(seen.map(e => e.name)).toEqual(["VKWebAppInit", "VKWebAppUpdateConfig"]);
	expect(tap.drain()).toEqual([]);
});

test("assigns sequential ids so a response can pair with its send", () => {
	const tap = createTap();
	const seen: BridgeTapEvent[] = [];
	tap.subscribe(e => seen.push(e));

	const sendId = tap.emit({
		direction: "out",
		kind: "send",
		name: "VKWebAppGetUserInfo",
	});
	tap.emit({
		direction: "in",
		kind: "response",
		name: "VKWebAppGetUserInfo",
		reqId: sendId,
		ok: true,
	});

	if (seen[0] === undefined || seen[1] === undefined) {
		throw new Error("expected a send and a response event");
	}
	expect(seen[1].reqId).toBe(seen[0].id);
	expect(seen[1].reqId).toBe(sendId);
});

test("buffer is bounded and drops the oldest events", () => {
	const tap = createTap(3);
	tap.emit({ direction: "out", kind: "send", name: "a" });
	tap.emit({ direction: "out", kind: "send", name: "b" });
	tap.emit({ direction: "out", kind: "send", name: "c" });
	tap.emit({ direction: "out", kind: "send", name: "d" });

	expect(tap.drain().map(e => e.name)).toEqual(["b", "c", "d"]);
});

test("unsubscribe stops delivery", () => {
	const tap = createTap();
	const seen: BridgeTapEvent[] = [];
	const off = tap.subscribe(e => seen.push(e));
	off();
	tap.emit({ direction: "out", kind: "send", name: "a" });

	expect(seen).toEqual([]);
});
