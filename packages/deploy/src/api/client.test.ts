import { describe, expect, it } from "vitest";
import { DeployError } from "../errors.ts";
import { createFetchSpy, sequence, instantSleep, type MockResponseSpec } from "../test-utils.ts";
import { callApi, httpGet, parseJsonBody } from "./client.ts";

const BASE = {
	accessToken: "token-1234567890",
	apiHost: "https://api.vk.ru/method/",
	apiVersion: "5.199",
	sleep: instantSleep,
	backoffBaseMs: 0,
};

function vkOk(payload: Record<string, unknown>): MockResponseSpec {
	return { body: { response: payload } };
}

describe("callApi", () => {
	it("assembles the upstream-compatible query string", async () => {
		const spy = createFetchSpy(() => vkOk({ upload_url: "https://up" }));
		const result = await callApi(
			"apps.getGoHostingUploadServer",
			{ app_id: 42, environment: 3 },
			{ ...BASE, fetchImpl: spy.fetchImpl },
		);

		expect(result).toEqual({ upload_url: "https://up" });
		const url = spy.calls[0]?.url ?? "";
		expect(url.startsWith("https://api.vk.ru/method/apps.getGoHostingUploadServer?")).toBe(
			true,
		);
		expect(url).toContain("app_id=42");
		expect(url).toContain("environment=3");
		expect(url).toContain("v=5.199");
		expect(url).toContain("cli_version=2");
		expect(url).toContain(`access_token=${encodeURIComponent("token-1234567890")}`);
	});

	it("maps VK error payloads to api-kind DeployErrors", async () => {
		const spy = createFetchSpy(() => ({
			body: { error: { error_code: 15, error_msg: "Access denied" } },
		}));
		await expect(
			callApi("apps.getGoHostingTask", { app_id: 1 }, { ...BASE, fetchImpl: spy.fetchImpl }),
		).rejects.toSatisfy((error: unknown) => {
			const e = error as DeployError;
			return e.kind === "api" && e.code === 15 && e.message.includes("Access denied");
		});
	});

	it("gives a login hint for VK error 5", async () => {
		const spy = createFetchSpy(() => ({
			body: { error: { error_code: 5, error_msg: "User authorization failed" } },
		}));
		await expect(
			callApi("apps.getGoHostingTask", { app_id: 1 }, { ...BASE, fetchImpl: spy.fetchImpl }),
		).rejects.toThrow(/vkma-deploy login/);
	});

	it("retries VK error 6 (rate limit) and succeeds", async () => {
		const spy = createFetchSpy(
			sequence(
				{ body: { error: { error_code: 6, error_msg: "Too many requests per second" } } },
				vkOk({ done: true }),
			),
		);
		const result = await callApi(
			"apps.getGoHostingTask",
			{ app_id: 1 },
			{ ...BASE, fetchImpl: spy.fetchImpl },
		);
		expect(result).toEqual({ done: true });
		expect(spy.calls.length).toBe(2);
	});

	it("caps the retry budget per operation — one budget, not budget²", async () => {
		// Interleaved transport flakiness and rate limiting used to hit the
		// inner httpGet budget once per outer callApi attempt (5 requests
		// for 3 attempts); a single budget must cap the operation at 3.
		let call = 0;
		const spy = createFetchSpy(() => {
			call += 1;
			if (call === 1 || call === 3) {
				throw new TypeError("fetch failed");
			}
			return { body: { error: { error_code: 6, error_msg: "rate limited" } } };
		});
		await expect(callApi("m", {}, { ...BASE, fetchImpl: spy.fetchImpl })).rejects.toSatisfy(
			(error: unknown) => (error as DeployError).kind === "network",
		);
		expect(spy.calls.length).toBe(3);
	});

	it("surfaces persistent VK error 6 as an api error after the budget", async () => {
		const spy = createFetchSpy(() => ({
			body: { error: { error_code: 6, error_msg: "Too many requests per second" } },
		}));
		await expect(callApi("m", {}, { ...BASE, fetchImpl: spy.fetchImpl })).rejects.toSatisfy(
			(error: unknown) => {
				const e = error as DeployError;
				return e.kind === "api" && e.code === 6;
			},
		);
		expect(spy.calls.length).toBe(3);
	});

	it("retries VK error 22 on createGoHostingTask (upstream issue #3 flake)", async () => {
		const spy = createFetchSpy(
			sequence(
				{ body: { error: { error_code: 22, error_msg: "invalid upload_response" } } },
				{ body: { error: { error_code: 22, error_msg: "invalid upload_response" } } },
				vkOk({ version: 5 }),
			),
		);
		const result = await callApi(
			"apps.createGoHostingTask",
			{},
			{
				...BASE,
				fetchImpl: spy.fetchImpl,
			},
		);
		expect(result).toEqual({ version: 5 });
		expect(spy.calls.length).toBe(3);
	});

	it("does not retry VK error 22 on other methods", async () => {
		const spy = createFetchSpy(() => ({
			body: { error: { error_code: 22, error_msg: "nope" } },
		}));
		await expect(
			callApi("apps.getGoHostingTask", {}, { ...BASE, fetchImpl: spy.fetchImpl }),
		).rejects.toSatisfy((error: unknown) => {
			const e = error as DeployError;
			return e.kind === "api" && e.code === 22;
		});
		expect(spy.calls.length).toBe(1);
	});

	it("retries transport failures with backoff", async () => {
		let failures = 0;
		const spy = createFetchSpy(() => {
			failures += 1;
			if (failures <= 2) {
				throw new TypeError("fetch failed");
			}
			return vkOk({ ok: 1 });
		});
		const result = await callApi("m", {}, { ...BASE, fetchImpl: spy.fetchImpl });
		expect(result).toEqual({ ok: 1 });
		expect(spy.calls.length).toBe(3);
	});

	it("retries HTTP 500 and 429", async () => {
		const spy = createFetchSpy(
			sequence({ status: 500, body: "err" }, { status: 429, body: "err" }, vkOk({ ok: 1 })),
		);
		const result = await callApi("m", {}, { ...BASE, fetchImpl: spy.fetchImpl });
		expect(result).toEqual({ ok: 1 });
	});

	it("fails immediately on non-retriable statuses", async () => {
		const spy = createFetchSpy(() => ({ status: 404, body: "nope" }));
		await expect(callApi("m", {}, { ...BASE, fetchImpl: spy.fetchImpl })).rejects.toSatisfy(
			(error: unknown) => (error as DeployError).code === "HTTP_404",
		);
		expect(spy.calls.length).toBe(1);
	});

	it("rejects HTML bodies with a clear error (upstream behavior kept)", async () => {
		const spy = createFetchSpy(() => ({ body: "<!DOCTYPE html><html>oops</html>" }));
		await expect(callApi("m", {}, { ...BASE, fetchImpl: spy.fetchImpl })).rejects.toSatisfy(
			(error: unknown) => (error as DeployError).code === "E_HTML_RESPONSE",
		);
	});

	it("masks the access token in request events", async () => {
		const urls: string[] = [];
		const spy = createFetchSpy(() => vkOk({}));
		await callApi(
			"m",
			{},
			{
				...BASE,
				fetchImpl: spy.fetchImpl,
				onEvent: event => {
					if (event.kind === "request" && event.url) {
						urls.push(event.url);
					}
				},
			},
		);
		expect(urls.length).toBeGreaterThan(0);
		expect(urls[0]).toContain("access_token=***");
		expect(urls[0]).not.toContain("token-1234567890");
	});

	it("includes a truncated response body preview in response events (verbose diagnostics)", async () => {
		const spy = createFetchSpy(() => vkOk({ padding: "x".repeat(5000) }));
		const bodies: string[] = [];
		await callApi(
			"m",
			{},
			{
				...BASE,
				fetchImpl: spy.fetchImpl,
				onEvent: event => {
					if (event.kind === "response" && event.body !== undefined) {
						bodies.push(event.body);
					}
				},
			},
		);
		expect(bodies.length).toBe(1);
		expect(bodies[0]).toContain("bytes)");
		expect((bodies[0] ?? "").length).toBeLessThan(1200);
	});

	it("masks token values in response body previews (invariant #3)", async () => {
		const spy = createFetchSpy(() => ({
			body: {
				access_token: "tok-secret-1234567890",
				refresh_token: "ref-secret-1234567890",
				error_code: 6,
			},
		}));
		const bodies: string[] = [];
		await httpGet("https://api.vk.ru/method/m?access_token=tok-secret-1234567890", {
			sleep: instantSleep,
			backoffBaseMs: 0,
			fetchImpl: spy.fetchImpl,
			onEvent: event => {
				if (event.kind === "response" && event.body !== undefined) {
					bodies.push(event.body);
				}
			},
		});
		expect(bodies.length).toBe(1);
		expect(bodies[0]).not.toContain("tok-secret");
		expect(bodies[0]).not.toContain("ref-secret");
		expect(bodies[0]).toContain('"access_token":"***"');
		// Error codes must stay readable. The JSON key "code" is never masked.
		expect(bodies[0]).toContain('"error_code":6');
	});

	it("throws aborted when the signal is already aborted", async () => {
		const spy = createFetchSpy(() => vkOk({}));
		const controller = new AbortController();
		controller.abort();
		await expect(
			callApi("m", {}, { ...BASE, fetchImpl: spy.fetchImpl, signal: controller.signal }),
		).rejects.toSatisfy((error: unknown) => (error as DeployError).kind === "aborted");
	});
	it("never follows redirects (the query string carries the token)", async () => {
		const spy = createFetchSpy(() => vkOk({}));
		await callApi("m", {}, { ...BASE, fetchImpl: spy.fetchImpl });
		expect(spy.calls[0]?.init?.redirect).toBe("error");
	});

	it("propagates onEvent callback errors instead of retrying them as network", async () => {
		let calls = 0;
		const spy = createFetchSpy(() => {
			calls += 1;
			return vkOk({});
		});
		const boom = new TypeError("user callback bug");
		await expect(
			callApi(
				"m",
				{},
				{
					...BASE,
					fetchImpl: spy.fetchImpl,
					onEvent: event => {
						if (event.kind === "response") {
							throw boom;
						}
					},
				},
			),
		).rejects.toBe(boom);
		expect(calls).toBe(1);
	});

	it("strips a BOM before HTML detection and JSON parsing", () => {
		expect(parseJsonBody('﻿{"ok":1}', "https://x/")).toEqual({ ok: 1 });
		try {
			parseJsonBody("﻿<!DOCTYPE html><html></html>", "https://x/");
			expect.unreachable("BOM-prefixed HTML must be detected");
		} catch (error) {
			expect((error as DeployError).code).toBe("E_HTML_RESPONSE");
		}
	});

	it("reports UTF-8 byte counts (not UTF-16 code units) in body previews", async () => {
		const bodies: string[] = [];
		const spy = createFetchSpy(() => ({ body: { padding: "я".repeat(2000) } }));
		await httpGet("https://x/", {
			fetchImpl: spy.fetchImpl,
			onEvent: event => {
				if (event.kind === "response" && event.body !== undefined) {
					bodies.push(event.body);
				}
			},
		});
		expect(bodies[0]).toMatch(/\(4014 bytes\)/);
	});
});

describe("httpGet", () => {
	it("returns status and text on ok responses", async () => {
		const spy = createFetchSpy(() => ({ status: 200, body: "plain" }));
		const result = await httpGet("https://x/", { fetchImpl: spy.fetchImpl });
		expect(result).toEqual({ status: 200, text: "plain" });
	});
});
