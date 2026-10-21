import { expect, test, vi } from "vitest";

const { listeners, sendMock } = vi.hoisted(() => {
	const listeners = new Set<(event: unknown) => void>();
	return {
		listeners,
		sendMock: vi.fn(async () => ({ result: "ok" })),
	};
});

vi.mock("@vkontakte/vk-bridge", () => ({
	default: {
		subscribe: (listener: (event: unknown) => void) => listeners.add(listener),
		unsubscribe: (listener: (event: unknown) => void) => listeners.delete(listener),
		send: sendMock,
	},
	applyMiddleware: vi.fn(),
	parseURLSearchParamsForGetLaunchParams: vi.fn(),
}));

import bridge, { onTap, type BridgeTapEvent } from "./index.ts";

function emitIncoming(detail: unknown) {
	for (const listener of listeners) {
		listener({ detail });
	}
}

test("wrapped send injects a vkma request_id and taps the outgoing event", async () => {
	const seen: BridgeTapEvent[] = [];
	onTap(event => seen.push(event));

	await bridge.send("VKWebAppSetLocation", { location: "profile" } as never);

	expect(sendMock).toHaveBeenCalledWith("VKWebAppSetLocation", {
		location: "profile",
		request_id: "__vkma_1",
	});
	expect(seen).toHaveLength(1);
	expect(seen[0]).toMatchObject({
		direction: "out",
		kind: "send",
		name: "VKWebAppSetLocation",
	});
});

test("a response carrying our request_id pairs back to its send", async () => {
	const seen: BridgeTapEvent[] = [];
	onTap(event => seen.push(event));

	await bridge.send("VKWebAppGetUserInfo");
	emitIncoming({
		type: "VKWebAppGetUserInfo",
		data: { request_id: "__vkma_2", id: 1, first_name: "Пётр" },
	});

	const [send, response] = seen;
	if (send === undefined || response === undefined) {
		throw new Error("expected both a send and a response event");
	}
	expect(send.kind).toBe("send");
	expect(response).toMatchObject({
		direction: "in",
		kind: "response",
		name: "VKWebAppGetUserInfo",
		reqId: send.id,
		ok: true,
	});
	// request_id is stripped from the reported payload
	expect(response.payload).toEqual({ id: 1, first_name: "Пётр" });
});

test("an error response keeps its payload and reports ok: false", async () => {
	const seen: BridgeTapEvent[] = [];
	onTap(event => seen.push(event));

	await bridge.send("VKWebAppStorageGet", { keys: ["a"] }).catch(() => {});
	emitIncoming({
		type: "VKWebAppStorageGet",
		data: {
			request_id: "__vkma_3",
			error_type: "client_error",
			error_data: { error_reason: 1 },
		},
	});

	expect(seen.at(-1)).toMatchObject({ kind: "response", ok: false });
});

test("incoming events without our request_id are tapped as unsolicited", () => {
	const seen: BridgeTapEvent[] = [];
	onTap(event => seen.push(event));

	emitIncoming({ type: "VKWebAppUpdateConfig", data: { appearance: "dark" } });

	expect(seen.at(-1)).toMatchObject({
		direction: "in",
		kind: "event",
		name: "VKWebAppUpdateConfig",
	});
});
