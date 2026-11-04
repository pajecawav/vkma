/**
 * OAuth device flow (`vkma-deploy login`).
 *
 * Mirrors the upstream flow against `oauth.vk.ru`:
 *  1. `get_auth_code` -> { auth_code, device_id }
 *  2. user opens `code_auth?stage=check&code=...&revoke=1` in a browser
 *  3. poll `code_auth_token` until HTTP 200 -> { access_token, expires_in }
 *
 * Improvements over upstream: the browser opens automatically, the URL is
 * also printed, polling does not burn retry attempts, and there is a
 * hard deadline instead of an infinite prompt loop.
 */

import { DeployError } from "../errors.ts";
import {
	deadlineSignal,
	httpGet,
	httpOnce,
	joinUrl,
	parseJsonBody,
	type HttpOptions,
} from "./client.ts";

export interface LoginOptions extends HttpOptions {
	readonly appId: number;
	readonly oauthHost: string;
	readonly oauthClientId: number;
	/** Print the auth URL through this callback (CLI logs it). */
	readonly onAuthUrl?: (url: string) => void;
	/**
	 * Opens the confirmation URL in a browser. The library never spawns
	 * processes. The CLI layer injects its opener here, and only for
	 * interactive (TTY) runs.
	 */
	readonly openBrowser?: (url: string) => void;
	readonly pollIntervalMs?: number;
	readonly timeoutMs?: number;
}

export interface LoginResult {
	readonly accessToken: string;
	readonly expiresIn?: number;
}

const DEFAULT_POLL_INTERVAL_MS = 1500;
const DEFAULT_TIMEOUT_MS = 5 * 60_000;

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function loginDeviceFlow(options: LoginOptions): Promise<LoginResult> {
	const authCodeUrl =
		joinUrl(options.oauthHost, "get_auth_code") +
		`?scope=offline&client_id=${options.oauthClientId}&mini_app_id=${options.appId}`;

	const { text } = await httpGet(authCodeUrl, options);
	const authJson = parseJsonBody(text, authCodeUrl);

	if (!isRecord(authJson) || typeof authJson["auth_code"] !== "string") {
		const error =
			isRecord(authJson) && isRecord(authJson["error"]) ? authJson["error"] : authJson;
		// Raw server payloads belong in details (redacted at print time),
		// never in the message. Messages flow into terminals and --json.
		throw new DeployError("api", "OAuth failed to issue an auth code", {
			code: "E_AUTH_CODE",
			details: { response: error },
		});
	}
	const authCode = authJson["auth_code"];
	const deviceId = authJson["device_id"];
	if (typeof deviceId !== "string") {
		throw new DeployError("api", "OAuth response is missing device_id", {
			code: "E_AUTH_CODE",
		});
	}

	const confirmUrl = `${joinUrl(options.oauthHost, "code_auth")}?stage=check&code=${encodeURIComponent(authCode)}&revoke=1`;
	options.onAuthUrl?.(confirmUrl);
	options.openBrowser?.(confirmUrl);

	const tokenUrl =
		joinUrl(options.oauthHost, "code_auth_token") +
		`?device_id=${encodeURIComponent(deviceId)}&client_id=${options.oauthClientId}&mini_app_id=${options.appId}`;

	const pollInterval = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
	const deadline = Date.now() + (options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
	const sleep =
		options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
	// Surfaced in the timeout error: "not confirmed yet" and a permanently
	// broken poll (bad client_id, revoked app) are both non-200 answers, so
	// we cannot fail fast. But we can explain what kept happening.
	let lastPollError: string | undefined;

	const loginTimeoutError = (): DeployError =>
		new DeployError(
			"network",
			`Login timed out — did you confirm access in the browser?${
				lastPollError === undefined ? "" : ` Last poll error: ${lastPollError}`
			}`,
			// The confirm URL carries a single-use code= parameter that
			// the redactor would mask inside any message; it was already
			// surfaced via onAuthUrl and survives verbatim in details.
			{ code: "E_LOGIN_TIMEOUT", details: { confirmUrl } },
		);

	for (;;) {
		if (options.signal?.aborted) {
			throw new DeployError("aborted", "Login aborted", { code: "E_ABORTED" });
		}
		if (Date.now() >= deadline) {
			throw loginTimeoutError();
		}

		let status = 0;
		let text = "";
		try {
			// Single-shot by design: the poll loop is its own retry. The
			// per-request deadline keeps a hung poll from outliving the budget.
			const result = await httpOnce(tokenUrl, {
				...options,
				signal: deadlineSignal(options.signal, deadline),
			});
			status = result.status;
			text = result.text;
		} catch (error) {
			if (error instanceof DeployError && error.kind === "aborted") {
				if (options.signal?.aborted !== true) {
					// The per-request deadline cut this poll, not the user.
					throw loginTimeoutError();
				}
				throw error;
			}
			// Not confirmed yet (VK answers non-200 until the user approves)
			// or a transient network hiccup. Keep polling.
			lastPollError = (error as Error).message;
			options.onEvent?.({
				kind: "retry",
				attempt: 1,
				maxAttempts: 1,
				error: (error as Error).message,
			});
		}

		if (status === 200) {
			const json = parseJsonBody(text, tokenUrl);
			if (
				isRecord(json) &&
				typeof json["access_token"] === "string" &&
				json["access_token"] !== ""
			) {
				return {
					accessToken: json["access_token"],
					expiresIn:
						typeof json["expires_in"] === "number" ? json["expires_in"] : undefined,
				};
			}
			const error = isRecord(json) && isRecord(json["error"]) ? json["error"] : json;
			throw new DeployError("api", "OAuth failed to issue an access token", {
				code: "E_AUTH_TOKEN",
				details: { response: error },
			});
		}

		await sleep(pollInterval);
	}
}
