import { describe, expect, it } from "vitest";
import { DeployError } from "../errors.ts";
import { createFetchSpy, route, sequence, instantSleep } from "../test-utils.ts";
import { loginDeviceFlow } from "./oauth.ts";

const BASE = {
	appId: 42,
	oauthHost: "https://oauth.vk.ru/",
	oauthClientId: 6670517,
	sleep: instantSleep,
	pollIntervalMs: 1,
};

describe("loginDeviceFlow", () => {
	it("walks the device flow: auth code -> poll -> token", async () => {
		const authUrls: string[] = [];
		const spy = createFetchSpy(
			sequence(
				{ body: { auth_code: "AC123", device_id: "DEV1" } },
				{ status: 403, body: { error: "not confirmed" } },
				{ status: 403, body: { error: "not confirmed" } },
				{ body: { access_token: "fresh-token-1", expires_in: 86400 } },
			),
		);
		const result = await loginDeviceFlow({
			...BASE,
			fetchImpl: spy.fetchImpl,
			onAuthUrl: url => authUrls.push(url),
		});

		expect(result).toEqual({ accessToken: "fresh-token-1", expiresIn: 86400 });
		expect(spy.calls[0]?.url).toContain(
			"get_auth_code?scope=offline&client_id=6670517&mini_app_id=42",
		);
		expect(authUrls[0]).toBe("https://oauth.vk.ru/code_auth?stage=check&code=AC123&revoke=1");
		expect(spy.calls[1]?.url).toContain(
			"code_auth_token?device_id=DEV1&client_id=6670517&mini_app_id=42",
		);
	});

	it("fails when get_auth_code errors", async () => {
		const spy = createFetchSpy(() => ({
			body: { error: { error_code: 1, error_msg: "nope" } },
		}));
		await expect(loginDeviceFlow({ ...BASE, fetchImpl: spy.fetchImpl })).rejects.toSatisfy(
			(error: unknown) => (error as DeployError).code === "E_AUTH_CODE",
		);
	});

	it("keeps raw server payloads out of the error message (redaction boundary)", async () => {
		const spy = createFetchSpy(() => ({
			body: { error: { error_code: 1, error_msg: "nope", echo: "tok-echoed-by-server" } },
		}));
		const error = (await loginDeviceFlow({ ...BASE, fetchImpl: spy.fetchImpl }).catch(
			(e: unknown) => e,
		)) as DeployError;
		expect(error.code).toBe("E_AUTH_CODE");
		expect(error.message).not.toContain("error_msg");
		expect(error.message).not.toContain("tok-echoed-by-server");
		// The payload survives for --verbose diagnostics via details, where
		// the logger's redactor (exact-value + structural) applies.
		expect(JSON.stringify(error.details)).toContain("tok-echoed-by-server");
	});

	it("moves the confirm URL out of the timeout message into details", async () => {
		const spy = createFetchSpy(
			route([
				["get_auth_code", () => ({ body: { auth_code: "A", device_id: "D" } })],
				["code_auth_token", () => ({ status: 403, body: {} })],
			]),
		);
		const error = (await loginDeviceFlow({
			...BASE,
			fetchImpl: spy.fetchImpl,
			timeoutMs: 10,
		}).catch((e: unknown) => e)) as DeployError;
		expect(error.code).toBe("E_LOGIN_TIMEOUT");
		// Messages pass through the redactor, which masks code= parameters —
		// the URL the user needs must not be mangled inside the message.
		expect(error.message).not.toContain("code_auth");
		const details = error.details as { confirmUrl?: string };
		expect(details.confirmUrl).toContain("code_auth?stage=check&code=A&revoke=1");
	});

	it("times out with a helpful message instead of looping forever", async () => {
		const spy = createFetchSpy(
			route([
				["get_auth_code", () => ({ body: { auth_code: "A", device_id: "D" } })],
				["code_auth_token", () => ({ status: 403, body: {} })],
			]),
		);
		await expect(
			loginDeviceFlow({ ...BASE, fetchImpl: spy.fetchImpl, timeoutMs: 10 }),
		).rejects.toSatisfy((error: unknown) => (error as DeployError).code === "E_LOGIN_TIMEOUT");
	});

	it("includes the last poll error in the timeout message for diagnosis", async () => {
		const spy = createFetchSpy(
			route([
				["get_auth_code", () => ({ body: { auth_code: "A", device_id: "D" } })],
				["code_auth_token", () => ({ status: 403, body: {} })],
			]),
		);
		// Real sleep: a handful of polls until the deadline, not a hot spin.
		await expect(
			loginDeviceFlow({
				...BASE,
				fetchImpl: spy.fetchImpl,
				timeoutMs: 30,
				pollIntervalMs: 5,
				sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
			}),
		).rejects.toSatisfy((error: unknown) =>
			(error as DeployError).message.includes("Last poll error: HTTP 403"),
		);
	});

	it("fails when the token response carries an error payload", async () => {
		const spy = createFetchSpy(
			sequence(
				{ body: { auth_code: "A", device_id: "D" } },
				{ body: { error: { error_code: 2, error_msg: "denied" } } },
			),
		);
		await expect(loginDeviceFlow({ ...BASE, fetchImpl: spy.fetchImpl })).rejects.toSatisfy(
			(error: unknown) => (error as DeployError).code === "E_AUTH_TOKEN",
		);
	});

	it("never spawns anything by itself — the browser opener is an injected callback", async () => {
		const spy = createFetchSpy(
			sequence(
				{ body: { auth_code: "A", device_id: "D" } },
				{ body: { access_token: "t", expires_in: 1 } },
			),
		);
		// No openBrowser callback: nothing may happen beyond the HTTP flow.
		await loginDeviceFlow({ ...BASE, fetchImpl: spy.fetchImpl });
		expect(spy.calls.length).toBe(2);
	});

	it("never leaks the access token into onEvent response bodies", async () => {
		const spy = createFetchSpy(
			sequence(
				{ body: { auth_code: "A", device_id: "D" } },
				{ body: { access_token: "super-secret-token-987", expires_in: 1 } },
			),
		);
		const bodies: string[] = [];
		await loginDeviceFlow({
			...BASE,
			fetchImpl: spy.fetchImpl,
			onEvent: event => {
				if (event.kind === "response" && event.body !== undefined) {
					bodies.push(event.body);
				}
			},
		});
		expect(bodies.length).toBe(2);
		expect(bodies.some(body => body.includes("super-secret-token-987"))).toBe(false);
		expect(bodies[1]).toContain('"access_token":"***"');
	});

	it("calls the injected opener with the confirmation URL when provided", async () => {
		const spy = createFetchSpy(
			sequence(
				{ body: { auth_code: "A2", device_id: "D" } },
				{ body: { access_token: "t", expires_in: 1 } },
			),
		);
		const opened: string[] = [];
		await loginDeviceFlow({
			...BASE,
			fetchImpl: spy.fetchImpl,
			openBrowser: url => opened.push(url),
		});
		expect(opened).toEqual(["https://oauth.vk.ru/code_auth?stage=check&code=A2&revoke=1"]);
	});
});
