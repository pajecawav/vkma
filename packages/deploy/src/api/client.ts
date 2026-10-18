/**
 * HTTP + VK API client.
 *
 * Wraps `fetch` with:
 * - retry with exponential backoff and jitter (upstream used a fixed 1s)
 * - HTML-body detection (VK occasionally returns error pages)
 * - VK error payload mapping to typed `DeployError`s
 * - AbortSignal support
 * - request/response events with the access token always masked
 */

import { CLI_VERSION } from "../constants.ts";
import { DeployError } from "../errors.ts";

export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type ApiParamValue = string | number | boolean | undefined;
export type ApiParams = Record<string, ApiParamValue>;

export interface RequestEvent {
	readonly kind: "request" | "response" | "retry";
	readonly url?: string;
	readonly method?: string;
	readonly status?: number;
	/** Response body preview (truncated) — present on "response" events. */
	readonly body?: string;
	readonly attempt?: number;
	readonly maxAttempts?: number;
	readonly error?: string;
}

/** Transport-level options shared by API calls, uploads, and OAuth. */
export interface HttpOptions {
	readonly signal?: AbortSignal;
	readonly onEvent?: (event: RequestEvent) => void;
	readonly fetchImpl?: FetchLike;
	readonly maxAttempts?: number;
	readonly backoffBaseMs?: number;
	/** Injectable sleep for tests; defaults to a real timer. */
	readonly sleep?: (ms: number) => Promise<void>;
}

export interface FetchClientOptions extends HttpOptions {
	readonly accessToken: string;
	readonly apiHost: string;
	readonly apiVersion: string;
}

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

const RETRIABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function maskToken(url: string): string {
	return url.replace(/([?&]access_token=)[^&\s]*/g, "$1***");
}

export function joinUrl(host: string, suffix: string): string {
	return host.endsWith("/") ? `${host}${suffix}` : `${host}/${suffix}`;
}

function buildQuery(params: ApiParams): string {
	const parts: string[] = [];
	for (const [key, value] of Object.entries(params)) {
		if (value === undefined) {
			continue;
		}
		parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
	}
	return parts.join("&");
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

function aborted(): DeployError {
	return new DeployError("aborted", "Operation aborted", { code: "E_ABORTED" });
}

async function backoffDelay(attempt: number, options: HttpOptions): Promise<void> {
	const base = options.backoffBaseMs ?? 500;
	const jitter = Math.floor(Math.random() * 250);
	const sleep = options.sleep ?? defaultSleep;
	await sleep(base * 2 ** (attempt - 1) + jitter);
}

/**
 * Masks secret values inside response body previews: JSON string values of
 * token fields and `access_token`-style query parameters. The JSON key
 * `"code"` is deliberately untouched — VK error payloads use it for error
 * codes, which must stay readable in verbose diagnostics.
 */
const SECRET_JSON_RE = /("(?:access_token|refresh_token)"\s*:\s*)"[^"]*"/g;
const SECRET_QUERY_RE = /([?&](?:access_token|refresh_token|code)=)[^&\s"']*/g;

function maskSecrets(text: string): string {
	return text.replace(SECRET_JSON_RE, '$1"***"').replace(SECRET_QUERY_RE, "$1***");
}

/** Max response body length embedded into verbose "response" events. */
export const BODY_PREVIEW_LIMIT = 1024;

/**
 * Truncated response body preview for verbose diagnostics. Secrets are
 * masked over the full text before truncation, so a token straddling the
 * cut can never leak into the event stream (AGENTS.md invariant #3).
 */
export function bodyPreview(text: string): string {
	const masked = maskSecrets(text);
	return masked.length > BODY_PREVIEW_LIMIT
		? `${masked.slice(0, BODY_PREVIEW_LIMIT)}… (${masked.length} bytes)`
		: masked;
}

/** GET with retry on transport errors and retriable statuses. */
export async function httpGet(
	url: string,
	options: HttpOptions,
): Promise<{ status: number; text: string }> {
	const maxAttempts = options.maxAttempts ?? 3;
	const fetchImpl = options.fetchImpl ?? fetch;
	const method = "GET";

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		if (options.signal?.aborted) {
			throw aborted();
		}
		try {
			options.onEvent?.({ kind: "request", method, url: maskToken(url) });
			const response = await fetchImpl(url, {
				method,
				headers: { accept: "application/json, text/plain, */*" },
				signal: options.signal,
				redirect: "follow",
			});
			const text = await response.text();
			options.onEvent?.({
				kind: "response",
				status: response.status,
				body: bodyPreview(text),
			});
			if (response.ok) {
				return { status: response.status, text };
			}
			if (RETRIABLE_STATUS.has(response.status) && attempt < maxAttempts) {
				options.onEvent?.({
					kind: "retry",
					attempt,
					maxAttempts,
					error: `HTTP ${response.status}`,
				});
				await backoffDelay(attempt, options);
				continue;
			}
			throw new DeployError(
				"network",
				`HTTP ${response.status} ${response.statusText}`.trim(),
				{
					code: `HTTP_${response.status}`,
					details: { url: maskToken(url) },
				},
			);
		} catch (error) {
			if (isAbortError(error) || options.signal?.aborted) {
				throw aborted();
			}
			if (error instanceof DeployError) {
				throw error;
			}
			// Transport failure (fetch rejects on DNS, socket, TLS...).
			if (attempt < maxAttempts) {
				options.onEvent?.({
					kind: "retry",
					attempt,
					maxAttempts,
					error: (error as Error).message,
				});
				await backoffDelay(attempt, options);
				continue;
			}
			throw new DeployError(
				"network",
				`Request failed after ${maxAttempts} attempts: ${(error as Error).message}`,
				{
					code: "E_NETWORK",
					details: { url: maskToken(url) },
				},
			);
		}
	}
	/* istanbul ignore next -- loop always returns or throws */
	throw new DeployError("network", "unreachable");
}

/** Parses a response body, rejecting HTML error pages with a clear message. */
export function parseJsonBody(text: string, url: string): unknown {
	const trimmed = text.trim();
	if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
		throw new DeployError(
			"network",
			"Server returned an HTML page instead of JSON (upstream hit this too)",
			{
				code: "E_HTML_RESPONSE",
				details: { url: maskToken(url) },
			},
		);
	}
	try {
		return JSON.parse(trimmed);
	} catch (cause) {
		throw new DeployError("network", `Response is not valid JSON`, {
			code: "E_BAD_JSON",
			details: { url: maskToken(url) },
			cause,
		});
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function vkErrorMessage(error: Record<string, unknown>): string {
	const code = error["error_code"];
	const message = error["error_msg"];
	const codeText =
		typeof code === "number" || typeof code === "string" ? String(code) : JSON.stringify(code);
	if (message === undefined) {
		return `${codeText}: unknown error`;
	}
	const messageText = typeof message === "string" ? message : JSON.stringify(message);
	return `${codeText}: ${messageText}`;
}

/**
 * Calls a VK API method: `GET {apiHost}{method}?...&v&access_token&cli_version`.
 * Retries transport errors and VK error code 6 ("too many requests per second").
 */
export async function callApi(
	method: string,
	params: ApiParams,
	options: FetchClientOptions,
): Promise<Record<string, unknown>> {
	const query = buildQuery({
		...params,
		v: options.apiVersion,
		access_token: options.accessToken,
		cli_version: CLI_VERSION,
	});
	const url = `${joinUrl(options.apiHost, method)}?${query}`;
	const maxAttempts = options.maxAttempts ?? 3;
	const sleep = options.sleep ?? defaultSleep;

	for (let attempt = 1; ; attempt++) {
		const { text } = await httpGet(url, options);
		const json = parseJsonBody(text, url);

		if (isRecord(json) && isRecord(json["error"])) {
			const error = json["error"];
			const code = Number(error["error_code"] ?? 0);

			if (code === 6 && attempt < maxAttempts) {
				options.onEvent?.({
					kind: "retry",
					attempt,
					maxAttempts,
					error: "VK error 6 (rate limit)",
				});
				await sleep((options.backoffBaseMs ?? 500) * 2 ** (attempt - 1) + 350);
				continue;
			}
			if (code === 5) {
				throw new DeployError(
					"api",
					`VK authorization failed (${vkErrorMessage(error)}). The token is missing, expired, or invalid — run "vkma-deploy login" or set VKMA_ACCESS_TOKEN.`,
					{ code: 5, details: error },
				);
			}
			throw new DeployError("api", `VK API error ${vkErrorMessage(error)}`, {
				code,
				details: error,
			});
		}

		if (isRecord(json) && "response" in json) {
			const response = json["response"];
			return isRecord(response) ? response : {};
		}

		throw new DeployError("api", `Unexpected VK API payload from ${method}`, {
			code: "E_BAD_PAYLOAD",
		});
	}
}
