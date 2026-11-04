import { beforeEach, describe, expect, test } from "vitest";
import bridge, { onEvent, onSend } from "./index.js";
import { parseURLSearchParamsForGetLaunchParams } from "./launch-params.js";
import { applyMiddleware } from "./middleware.js";
import type { BridgeTapEvent } from "./tap.js";

/** Respond to the most recent outgoing send of the default bridge. */
function respondToLast(type: string, data: Record<string, unknown>): void {
	const last = bridge.tap.drain().findLast((event: BridgeTapEvent) => event.direction === "out");
	const requestId =
		last !== undefined && typeof last.payload === "object" && last.payload !== null
			? (last.payload as Record<string, unknown>)["request_id"]
			: undefined;
	window.dispatchEvent(
		new MessageEvent("message", {
			data: { type, data: { ...data, request_id: requestId }, frameId: "frame-1" },
		}),
	);
}

describe("applyMiddleware", () => {
	test("middleware wraps send without breaking responses", async () => {
		const seen: string[] = [];
		const enhanced = applyMiddleware(_api => next => async (method, props, options) => {
			seen.push(method);
			return next(method, props, options);
		})(bridge);

		const promise = enhanced.send("VKWebAppSetLocation", { location: "profile" });
		respondToLast("VKWebAppSetLocationResult", { result: true });
		await expect(promise).resolves.toEqual({ result: true });
		expect(seen).toEqual(["VKWebAppSetLocation"]);
	});

	test("empty middleware list returns the bridge as-is", () => {
		const enhanced = applyMiddleware()(bridge);
		expect(enhanced.subscribe).toBe(bridge.subscribe);
	});
});

describe("parseURLSearchParamsForGetLaunchParams", () => {
	let search: string;
	beforeEach(() => {
		search = window.location.search;
	});

	test("parses and validates the known keys", () => {
		const params = parseURLSearchParamsForGetLaunchParams(
			"vk_user_id=1&vk_app_id=2&vk_is_app_user=1&vk_language=ru&vk_platform=desktop_web&vk_viewer_group_role=admin&sign=abc&vk_ref=feed&vk_is_favorite=0&odr_enabled=1&unknown_field=42",
		);
		expect(params).toEqual({
			vk_user_id: 1,
			vk_app_id: 2,
			vk_is_app_user: 1,
			vk_language: "ru",
			vk_platform: "desktop_web",
			vk_viewer_group_role: "admin",
			sign: "abc",
			vk_ref: "feed",
			vk_is_favorite: 0,
			odr_enabled: 1,
		});
		expect(search !== undefined).toBe(true);
	});

	test("invalid enum values are dropped", () => {
		const params = parseURLSearchParamsForGetLaunchParams("vk_language=xx&vk_platform=huh");
		expect(params["vk_language"]).toBeUndefined();
		expect(params["vk_platform"]).toBeUndefined();
	});

	test("parses a real OK (Odnoklassniki) launch: OK-only keys, *_ok platform, boolean toggles", () => {
		// Captured live from https://ok.ru/app/vk_test_vkapp. The OK host sends
		// vk_* keys the vk.com catalogue never had, booleans where vk.com sends
		// 0/1, and *_ok platform values (dev.vk.ru/ru/ok/development/launch-parameters).
		const params = parseURLSearchParamsForGetLaunchParams(
			"vk_access_token_settings=wall&vk_app_id=6703670&vk_are_notifications_enabled=true&vk_are_pushes_enabled=false&vk_client=ok&vk_is_app_user=true&vk_language=ru&vk_ok_app_id=512000435468&vk_ok_ref=other&vk_ok_user_id=910077458625&vk_original_vk_id=791264063&vk_platform=desktop_web_ok&vk_ref=other&vk_ts=1793295516164&vk_user_id=791264063",
		);
		expect(params).toEqual({
			vk_access_token_settings: "wall",
			vk_app_id: 6703670,
			vk_are_notifications_enabled: 1,
			vk_are_pushes_enabled: 0,
			vk_client: "ok",
			vk_is_app_user: 1,
			vk_language: "ru",
			vk_ok_app_id: 512000435468,
			vk_ok_ref: "other",
			vk_ok_user_id: 910077458625,
			vk_original_vk_id: 791264063,
			vk_platform: "desktop_web_ok",
			vk_ref: "other",
			vk_ts: 1793295516164,
			vk_user_id: 791264063,
		});
	});
});

describe("the default instance", () => {
	test("publishes the devtools handle on globalThis", () => {
		const handle = (globalThis as Record<string, unknown>)["__vkmaDevtoolsBridge"] as {
			tap: unknown;
			send: (name: string, params?: Record<string, unknown>) => Promise<unknown>;
		};
		expect(handle).toBeDefined();
		expect(typeof handle.send).toBe("function");
	});

	test("the default instance streams through the module-level onSend/onEvent", async () => {
		const sent: Array<{ name: string; requestId: unknown }> = [];
		const incoming: string[] = [];
		const offSend = onSend(event =>
			sent.push({
				name: event.name,
				requestId: (event.payload as Record<string, unknown>)["request_id"],
			}),
		);
		const offEvent = onEvent(event => incoming.push(event.name));

		const promise = bridge.send("VKWebAppGetUserInfo");
		const requestId = sent.at(-1)?.requestId;
		window.dispatchEvent(
			new MessageEvent("message", {
				data: { type: "VKWebAppGetUserInfoResult", data: { id: 7, request_id: requestId } },
			}),
		);
		await expect(promise).resolves.toEqual({ id: 7 });
		// The first tap subscription replays the buffer, so earlier sends of
		// this file show up too. Assert on the newest event.
		expect(sent.at(-1)?.name).toBe("VKWebAppGetUserInfo");
		expect(incoming.at(-1)).toBe("VKWebAppGetUserInfoResult");

		offSend();
		offEvent();
	});
});
