import { describe, expect, it } from "vitest";
import { DeployError } from "../errors.ts";
import { createFetchSpy, instantSleep, sequence } from "../test-utils.ts";
import { getAppTitle } from "./apps.ts";

const BASE = {
	accessToken: "token-1234567890",
	apiHost: "https://api.vk.ru/method/",
	apiVersion: "5.199",
	sleep: instantSleep,
	backoffBaseMs: 0,
};

/** `apps.get` answers an unknown or invisible id with an empty list (live-verified). */
const NO_APP = { body: { response: { count: 0, items: [] } } };

describe("getAppTitle", () => {
	it("asks apps.get for the app title with the wire params of every API call", async () => {
		const spy = createFetchSpy(() => ({
			body: {
				response: { count: 1, items: [{ type: "html5_game", id: 42, title: "My App" }] },
			},
		}));
		const title = await getAppTitle(42, { ...BASE, fetchImpl: spy.fetchImpl });

		expect(title).toBe("My App");
		expect(spy.calls.length).toBe(1);
		const url = spy.calls[0]?.url ?? "";
		expect(url.startsWith("https://api.vk.ru/method/apps.get?")).toBe(true);
		expect(url).toContain("app_id=42");
		// Title only: the full app object (banners, icons) is pure weight.
		expect(url).toContain("app_fields=title");
		expect(url).toContain("v=5.199");
		expect(url).toContain("cli_version=2");
		expect(url).toContain(`access_token=${encodeURIComponent("token-1234567890")}`);
	});

	it("returns undefined for an unknown app (empty list, not an error)", async () => {
		const spy = createFetchSpy(() => NO_APP);
		await expect(
			getAppTitle(999999999, { ...BASE, fetchImpl: spy.fetchImpl }),
		).resolves.toBeUndefined();
	});

	it.each([
		["an item without a title", { count: 1, items: [{ id: 42, type: "html5_game" }] }],
		["an empty title", { count: 1, items: [{ id: 42, title: "" }] }],
		["a whitespace-only title", { count: 1, items: [{ id: 42, title: "  \t " }] }],
		["a non-string title", { count: 1, items: [{ id: 42, title: 42 }] }],
		["items that are not a list", { count: 1, items: { id: 42, title: "My App" } }],
		["no items at all", { count: 0 }],
	])("returns undefined for %s", async (_label, payload) => {
		const spy = createFetchSpy(() => ({ body: { response: payload } }));
		await expect(
			getAppTitle(42, { ...BASE, fetchImpl: spy.fetchImpl }),
		).resolves.toBeUndefined();
	});

	it("propagates VK errors as api-kind DeployErrors", async () => {
		const spy = createFetchSpy(() => ({
			body: { error: { error_code: 15, error_msg: "Access denied" } },
		}));
		const error = await getAppTitle(42, { ...BASE, fetchImpl: spy.fetchImpl }).catch(
			(cause: unknown) => cause,
		);
		expect(error).toBeInstanceOf(DeployError);
		expect((error as DeployError).kind).toBe("api");
		expect((error as DeployError).code).toBe(15);
	});

	it("keeps the caller's attempt budget: one attempt means no retry", async () => {
		const spy = createFetchSpy(
			sequence(
				{ body: { error: { error_code: 6, error_msg: "Too many requests" } } },
				{
					body: { response: { count: 1, items: [{ id: 42, title: "Late" }] } },
				},
			),
		);
		await expect(
			getAppTitle(42, { ...BASE, fetchImpl: spy.fetchImpl, maxAttempts: 1 }),
		).rejects.toSatisfy((error: unknown) => (error as DeployError).code === 6);
		expect(spy.calls.length).toBe(1);
	});
});
