import { describe, expect, it } from "vitest";
import { DeployError } from "../errors.ts";
import { createFetchSpy, route, sequence, instantSleep } from "../test-utils.ts";
import { loginDeviceFlow } from "./oauth.ts";

const BASE = {
	appId: 42,
	oauthHost: "https://oauth.vk.ru/",
	oauthClientId: 6670517,
	openBrowser: false,
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
});
