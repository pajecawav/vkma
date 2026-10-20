import { describe, expect, it } from "vitest";
import type { FetchLike } from "../api/client.ts";
import { DeployError } from "../errors.ts";
import { createFetchSpy, route, instantSleep } from "../test-utils.ts";
import { waitForQueue, type QueueEvent } from "./queue.ts";

const BASE = {
	accessToken: "token-1234567890",
	apiHost: "https://api.vk.ru/method/",
	apiVersion: "5.199",
	sleep: instantSleep,
	backoffBaseMs: 0,
	appId: 42,
	version: 999,
	timeoutMs: 60_000,
};

function subscribeResponse(): { body: Record<string, unknown> } {
	return {
		body: {
			response: { base_url: "https://queue.vk/", key: "poll-key==", ts: 1, app_id: 100500 },
		},
	};
}

function poll(events: unknown[], ts: number): { body: Record<string, unknown> } {
	return { body: { ts, events: events.map(data => ({ data })) } };
}

const URLS = {
	desktop: "vk_app_desktop_dev_url",
	mobile: "vk_app_dev_url",
	web: "iframe_secure_url",
	legacy: "iframe_url",
};

describe("waitForQueue", () => {
	it("collects URLs until both environments report handled", async () => {
		const events: QueueEvent[] = [];
		let polls = 0;
		const spy = createFetchSpy(url => {
			if (url.includes("subscribeToHostingQueue")) {
				return subscribeResponse();
			}
			polls += 1;
			if (polls === 1) {
				return poll(
					[
						{ type: "success", code: 200 },
						{
							type: "success",
							code: 201,
							message: {
								is_production: true,
								urls: {
									[URLS.desktop]: "https://prod",
									[URLS.legacy]: "https://legacy",
								},
							},
						},
					],
					2,
				);
			}
			return poll(
				[
					{
						type: "success",
						code: 201,
						message: { is_production: false, urls: { [URLS.desktop]: "https://dev" } },
					},
				],
				3,
			);
		});

		const result = await waitForQueue({
			...BASE,
			fetchImpl: spy.fetchImpl,
			onQueueEvent: event => events.push(event),
		});

		expect(result.urls.production).toEqual({ [URLS.desktop]: "https://prod" });
		expect(result.urls.dev).toEqual({ [URLS.desktop]: "https://dev" });
		expect(result.urls.production?.[URLS.legacy]).toBeUndefined(); // legacy iframe_url dropped
		expect(spy.calls[0]?.url).toContain("apps.subscribeToHostingQueue");
		const pollUrl = spy.calls[1]?.url ?? "";
		expect(pollUrl).toContain("act=a_check");
		expect(pollUrl).toContain(`key=${encodeURIComponent("poll-key==")}`);
		expect(pollUrl).toContain("id=100500");
		expect(pollUrl).toContain("wait=5");
		expect(spy.calls[1]?.url).toContain("ts=1");
		expect(spy.calls[2]?.url).toContain("ts=2");
		expect(events.map(event => event.code)).toContain(201);
	});

	it("terminates on skip events (202) for a single environment", async () => {
		const spy = createFetchSpy(
			route([
				["subscribeToHostingQueue", subscribeResponse],
				[
					"act=a_check",
					() =>
						poll(
							[
								{
									type: "success",
									code: 201,
									message: {
										is_production: true,
										urls: { [URLS.web]: "https://p" },
									},
								},
								{ type: "success", code: 202, message: { environment: "1" } },
							],
							2,
						),
				],
			]),
		);
		const result = await waitForQueue({ ...BASE, fetchImpl: spy.fetchImpl });
		expect(result.urls.production).toBeDefined();
		expect(spy.calls.length).toBe(2);
	});

	it("confirms via apps.confirmDeploy when a code provider is given", async () => {
		const spy = createFetchSpy(
			route([
				["subscribeToHostingQueue", subscribeResponse],
				[
					"act=a_check",
					() =>
						poll(
							[
								{ type: "success", code: 203 },
								{ type: "success", code: 205 },
								{ type: "success", code: 204 },
								{
									type: "success",
									code: 201,
									message: {
										is_production: true,
										urls: { [URLS.web]: "https://p" },
									},
								},
								{ type: "success", code: 202, message: { environment: "1" } },
							],
							2,
						),
				],
				["confirmDeploy", () => ({ body: { response: 1 } })],
			]),
		);
		const result = await waitForQueue({
			...BASE,
			fetchImpl: spy.fetchImpl,
			confirmCode: async () => "4242",
		});
		expect(result.pushSent).toBe(true);
		expect(result.confirmed).toBe(true);
		const confirmCall = spy.calls.find(call => call.url.includes("apps.confirmDeploy"));
		expect(confirmCall?.url).toContain("code=4242");
		expect(confirmCall?.url).toContain("version=999");
	});

	it("fails with a user error when event 205 arrives without a code provider", async () => {
		const spy = createFetchSpy(
			route([
				["subscribeToHostingQueue", subscribeResponse],
				["act=a_check", () => poll([{ type: "success", code: 205 }], 2)],
			]),
		);
		await expect(waitForQueue({ ...BASE, fetchImpl: spy.fetchImpl })).rejects.toSatisfy(
			(error: unknown) =>
				(error as DeployError).kind === "user" &&
				error instanceof DeployError &&
				error.code === 205,
		);
	});

	it("treats error 109 (test group update) as non-fatal like upstream", async () => {
		const spy = createFetchSpy(
			route([
				["subscribeToHostingQueue", subscribeResponse],
				[
					"act=a_check",
					() =>
						poll(
							[
								{
									type: "error",
									code: 109,
									message: { message: "test group fail" },
								},
								{
									type: "success",
									code: 201,
									message: {
										is_production: true,
										urls: { [URLS.web]: "https://p" },
									},
								},
								{ type: "success", code: 202, message: { environment: "1" } },
							],
							2,
						),
				],
			]),
		);
		const result = await waitForQueue({ ...BASE, fetchImpl: spy.fetchImpl });
		expect(result.urls.production).toBeDefined();
	});

	it("maps fatal queue errors to api DeployErrors with the code", async () => {
		const spy = createFetchSpy(
			route([
				["subscribeToHostingQueue", subscribeResponse],
				[
					"act=a_check",
					() => poll([{ type: "error", code: 103, message: { message: "boom" } }], 2),
				],
			]),
		);
		await expect(waitForQueue({ ...BASE, fetchImpl: spy.fetchImpl })).rejects.toSatisfy(
			(error: unknown) =>
				(error as DeployError).kind === "api" && (error as DeployError).code === 103,
		);
	});

	it("keeps the detail when the queue error message is a plain string (upstream shape)", async () => {
		const spy = createFetchSpy(
			route([
				["subscribeToHostingQueue", subscribeResponse],
				[
					"act=a_check",
					() => poll([{ type: "error", code: 103, message: "boom-string" }], 2),
				],
			]),
		);
		await expect(waitForQueue({ ...BASE, fetchImpl: spy.fetchImpl })).rejects.toSatisfy(
			(error: unknown) =>
				(error as DeployError).kind === "api" &&
				(error as DeployError).message.includes("boom-string"),
		);
	});

	it("times out instead of polling forever (fixes upstream issue #119)", async () => {
		const spy = createFetchSpy(async url => {
			if (url.includes("subscribeToHostingQueue")) {
				return subscribeResponse();
			}
			await new Promise(resolve => setTimeout(resolve, 5));
			return poll([], Date.now());
		});
		await expect(
			waitForQueue({ ...BASE, fetchImpl: spy.fetchImpl, timeoutMs: 60 }),
		).rejects.toSatisfy((error: unknown) => (error as DeployError).code === "E_QUEUE_TIMEOUT");
	});

	it("cuts an in-flight poll at the deadline, not only between polls", async () => {
		// A poll that never resolves on its own — only the abort path can end
		// it, like a hung server connection. Deadline checks between polls
		// are advisory on their own.
		const fetchImpl: FetchLike = (url, init) => {
			if (url.includes("subscribeToHostingQueue")) {
				return Promise.resolve(
					new Response(JSON.stringify(subscribeResponse().body), { status: 200 }),
				);
			}
			return new Promise<never>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () => {
					reject(new DOMException("This operation was aborted", "AbortError"));
				});
			});
		};
		await expect(waitForQueue({ ...BASE, fetchImpl, timeoutMs: 40 })).rejects.toSatisfy(
			(error: unknown) => (error as DeployError).code === "E_QUEUE_TIMEOUT",
		);
	});

	it("pauses the deadline while the event-205 confirmation prompt is open", async () => {
		let polls = 0;
		const spy = createFetchSpy(url => {
			if (url.includes("subscribeToHostingQueue")) {
				return subscribeResponse();
			}
			if (url.includes("apps.confirmDeploy")) {
				return { body: { response: 1 } };
			}
			polls += 1;
			if (polls === 1) {
				return poll(
					[
						{ type: "success", code: 205 },
						{ type: "success", code: 204 },
					],
					2,
				);
			}
			return poll(
				[
					{
						type: "success",
						code: 201,
						message: { is_production: true, urls: { [URLS.web]: "https://p" } },
					},
					{ type: "success", code: 202, message: { environment: "1" } },
				],
				3,
			);
		});
		const result = await waitForQueue({
			...BASE,
			fetchImpl: spy.fetchImpl,
			timeoutMs: 40,
			confirmCode: async () => {
				// Reading the code from a phone takes longer than the whole
				// deadline — the budget must not burn while the user types.
				await new Promise(resolve => setTimeout(resolve, 90));
				return "4242";
			},
		});
		expect(result.confirmed).toBe(true);
		expect(result.urls.production).toEqual({ [URLS.web]: "https://p" });
	});

	it("rejects malformed subscribe responses", async () => {
		const spy = createFetchSpy(
			route([["subscribeToHostingQueue", () => ({ body: { response: {} } })]]),
		);
		await expect(waitForQueue({ ...BASE, fetchImpl: spy.fetchImpl })).rejects.toSatisfy(
			(error: unknown) => (error as DeployError).code === "E_BAD_SUBSCRIBE",
		);
	});

	it("records test group URLs (event 206)", async () => {
		const spy = createFetchSpy(
			route([
				["subscribeToHostingQueue", subscribeResponse],
				[
					"act=a_check",
					() =>
						poll(
							[
								{ type: "success", code: 206, message: { url: "https://tg" } },
								{
									type: "success",
									code: 201,
									message: {
										is_production: true,
										urls: { [URLS.web]: "https://p" },
									},
								},
								{ type: "success", code: 202, message: { environment: "1" } },
							],
							2,
						),
				],
			]),
		);
		const result = await waitForQueue({ ...BASE, fetchImpl: spy.fetchImpl });
		expect(result.testGroupUrl).toBe("https://tg");
	});
});
