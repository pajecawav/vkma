/**
 * Hosting queue: subscribe + long-poll until both environments are handled.
 *
 * Event codes (upstream semantics):
 *  200 success · 201 URLs changed · 202 environment skipped · 203 push sent
 *  204 push approved · 205 confirm via message code · 206 test group URL
 *
 * Fixes vs upstream: a hard deadline (issue #119 — upstream polls forever),
 * AbortSignal support, structured events for library consumers, and errors
 * that say which event code failed.
 */

import {
	callApi,
	httpGet,
	parseJsonBody,
	type FetchClientOptions,
	type RequestEvent,
} from "../api/client.ts";
import {
	ERROR_TEST_GROUP_UPDATE,
	EVENT_CODE,
	ENV_DEV,
	ENV_PRODUCTION,
	QUEUE_POLL_WAIT_SEC,
	URL_KEYS,
} from "../constants.ts";
import { DeployError } from "../errors.ts";

export interface QueueUrlUpdate {
	readonly isProduction: boolean;
	readonly urls: Record<string, string>;
}

export interface QueueEvent {
	readonly code: number;
	readonly message?: string;
	readonly urlUpdate?: QueueUrlUpdate;
	readonly testGroupUrl?: string;
}

export interface WaitForQueueOptions extends FetchClientOptions {
	readonly appId: number;
	readonly version: number;
	/** Overall deadline in ms (from `queueTimeoutSec` / `--timeout`). */
	readonly timeoutMs: number;
	/**
	 * Environments this deploy targets. Non-targeted environments count as
	 * handled immediately, so single-environment deploys terminate on their
	 * own URL event instead of waiting for a server skip event (202).
	 * Default: both.
	 */
	readonly environments?: { dev: boolean; production: boolean };
	/**
	 * Provides the confirmation code for event 205.
	 * Without it, event 205 fails with a `user` error explaining the options.
	 */
	readonly confirmCode?: () => Promise<string>;
	readonly onQueueEvent?: (event: QueueEvent) => void;
}

export interface QueueResult {
	readonly urls: { production?: Record<string, string>; dev?: Record<string, string> };
	readonly testGroupUrl?: string;
	readonly pushSent: boolean;
	readonly confirmed: boolean;
}

interface QueueResponse {
	readonly ts: string | number;
	readonly events?: readonly { data?: unknown }[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

export async function waitForQueue(options: WaitForQueueOptions): Promise<QueueResult> {
	const subscribe = await callApi(
		"apps.subscribeToHostingQueue",
		{ app_id: options.appId, version: options.version },
		options,
	);
	const baseUrl = subscribe["base_url"];
	const key = subscribe["key"];
	const ts = subscribe["ts"];
	const pollId = subscribe["app_id"];
	if (
		typeof baseUrl !== "string" ||
		typeof key !== "string" ||
		(typeof ts !== "string" && typeof ts !== "number") ||
		typeof pollId !== "number"
	) {
		throw new DeployError("api", "Malformed subscribeToHostingQueue response", {
			code: "E_BAD_SUBSCRIBE",
			details: subscribe,
		});
	}

	const deadline = Date.now() + options.timeoutMs;
	const targets = options.environments ?? { dev: true, production: true };
	const handled = { production: !targets.production, dev: !targets.dev };
	const result: {
		urls: { production?: Record<string, string>; dev?: Record<string, string> };
		testGroupUrl?: string;
		pushSent: boolean;
		confirmed: boolean;
	} = { urls: {}, pushSent: false, confirmed: false };
	let currentTs = String(ts);

	for (;;) {
		if (options.signal?.aborted) {
			throw new DeployError("aborted", "Aborted while waiting for the deploy queue", {
				code: "E_ABORTED",
			});
		}
		if (Date.now() > deadline) {
			throw new DeployError(
				"network",
				`Timed out waiting for the hosting queue after ${Math.round(options.timeoutMs / 1000)}s (upstream hangs forever here — issue #119). Increase with --timeout <sec> or VKMA_TIMEOUT.`,
				{ code: "E_QUEUE_TIMEOUT" },
			);
		}

		const pollUrl =
			`${baseUrl}?act=a_check&key=${encodeURIComponent(key)}&ts=${encodeURIComponent(currentTs)}` +
			`&id=${pollId}&wait=${QUEUE_POLL_WAIT_SEC}`;
		const { text } = await httpGet(pollUrl, options);
		const json = parseJsonBody(text, pollUrl) as QueueResponse;
		if (json.ts === undefined) {
			throw new DeployError("api", "Queue response is missing ts", { code: "E_BAD_QUEUE" });
		}
		currentTs = String(json.ts);

		for (const wrapper of json.events ?? []) {
			const data = isRecord(wrapper) ? wrapper["data"] : undefined;
			if (!isRecord(data)) {
				continue;
			}
			const type = data["type"];
			const code = Number(data["code"] ?? 0);
			const rawMessage = data["message"];
			const message = isRecord(rawMessage) ? rawMessage : undefined;

			if (type === "error") {
				if (code === ERROR_TEST_GROUP_UPDATE) {
					options.onEvent?.({
						kind: "retry",
						error: "Test group URL update error (code 109)",
					} satisfies RequestEvent);
					continue;
				}
				// VK has been observed sending `message` both as an object
				// ({ message: "..." }) and as a plain string (upstream
				// concatenated it directly) — handle both shapes.
				const rawDetail =
					typeof rawMessage === "string" ? rawMessage : message?.["message"];
				const detail =
					typeof rawDetail === "string"
						? rawDetail
						: rawDetail === undefined
							? ""
							: JSON.stringify(rawDetail);
				throw new DeployError(
					"api",
					`Deploy failed, error code #${code}: ${detail}`.trim(),
					{
						code,
						details: message,
					},
				);
			}

			if (type !== "success") {
				continue;
			}

			switch (code) {
				case EVENT_CODE.success:
					options.onQueueEvent?.({ code });
					break;

				case EVENT_CODE.urlsChanged: {
					const urls = isRecord(message?.["urls"]) ? message["urls"] : undefined;
					if (urls === undefined || Object.keys(urls).length === 0) {
						break;
					}
					const isProduction = message?.["is_production"] === true;
					const clean: Record<string, string> = {};
					for (const [urlKey, urlValue] of Object.entries(urls)) {
						if (urlKey === URL_KEYS.webLegacy || typeof urlValue !== "string") {
							continue; // legacy iframe_url, same as upstream
						}
						clean[urlKey] = urlValue;
					}
					if (isProduction) {
						handled.production = true;
						result.urls.production = clean;
					} else {
						handled.dev = true;
						result.urls.dev = clean;
					}
					options.onQueueEvent?.({ code, urlUpdate: { isProduction, urls: clean } });
					break;
				}

				case EVENT_CODE.skipEnvironment: {
					const rawEnvironment = message?.["environment"];
					const environmentText =
						typeof rawEnvironment === "string" || typeof rawEnvironment === "number"
							? String(rawEnvironment)
							: "";
					const environment = Number.parseInt(environmentText, 10);
					if (environment === ENV_DEV) {
						handled.dev = true;
					} else if (environment === ENV_PRODUCTION) {
						handled.production = true;
					}
					options.onQueueEvent?.({ code });
					break;
				}

				case EVENT_CODE.pushSent:
					result.pushSent = true;
					options.onQueueEvent?.({ code });
					break;

				case EVENT_CODE.pushApproved:
					result.confirmed = true;
					options.onQueueEvent?.({ code });
					break;

				case EVENT_CODE.confirmViaMessage: {
					if (options.confirmCode === undefined) {
						throw new DeployError(
							"user",
							"Deploy requires a confirmation code (VK sent it via message, event 205). Run from a terminal, pass --interactive, or provide a confirmCode() callback.",
							{ code: 205 },
						);
					}
					const code2 = await options.confirmCode();
					await callApi(
						"apps.confirmDeploy",
						{ app_id: options.appId, version: options.version, code: code2 },
						options,
					);
					options.onQueueEvent?.({ code });
					break;
				}

				case EVENT_CODE.testGroupUrlUpdated: {
					const url = message?.["url"];
					if (typeof url === "string") {
						result.testGroupUrl = url;
					}
					options.onQueueEvent?.({
						code,
						testGroupUrl: typeof url === "string" ? url : undefined,
					});
					break;
				}

				default:
					options.onQueueEvent?.({ code });
					break;
			}
		}

		if (handled.production && handled.dev) {
			return result;
		}
	}
}
