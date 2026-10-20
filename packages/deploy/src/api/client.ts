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
import { runWithRetry } from "./retry.ts";

/** Internal marker: VK error 6 is retriable within the call budget. */
const VK_RATE_LIMIT_RETRY = "E_VK_RATE_LIMIT_RETRY";

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

const RETRIABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * True for errors a fresh attempt can plausibly fix: transport failures
 * (`E_TRANSPORT`) and the retriable HTTP statuses. Shared by every
 * transport-calling module so the retry policy cannot drift again.
 */
export function isRetriableTransport(error: unknown): boolean {
	if (!(error instanceof DeployError) || error.kind !== "network") {
		return false;
	}
	if (error.code === "E_TRANSPORT") {
		return true;
	}
	if (typeof error.code === "string" && error.code.startsWith("HTTP_")) {
		return RETRIABLE_STATUS.has(Number(error.code.slice("HTTP_".length)));
	}
	return false;
}

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

/**
 * Composes the user signal with a hard per-request deadline, so a hung
 * server cannot outlive the operation's budget — deadline checks between
 * requests are advisory on their own (undici's own timeouts default to
 * ~300s). The caller distinguishes a deadline abort from a user abort by
 * checking its own signal.
 */
export function deadlineSignal(signal: AbortSignal | undefined, deadlineAt: number): AbortSignal {
	const remaining = deadlineAt - Date.now();
	if (remaining <= 0) {
		return AbortSignal.abort(new Error("deadline exceeded"));
	}
	const timeoutSignal = AbortSignal.timeout(remaining);
	return signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal]);
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

/**
 * Single transport attempt: one fetch, typed errors, request/response
 * events. Retry policy lives in `runWithRetry`; callers own the budget.
 */
export async function httpOnce(
	url: string,
	options: HttpOptions,
): Promise<{ status: number; text: string }> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const method = "GET";
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
		throw new DeployError("network", `HTTP ${response.status} ${response.statusText}`.trim(), {
			code: `HTTP_${response.status}`,
			details: { url: maskToken(url) },
		});
	} catch (error) {
		if (isAbortError(error) || options.signal?.aborted) {
			throw aborted();
		}
		if (error instanceof DeployError) {
			throw error;
		}
		// Transport failure (fetch rejects on DNS, socket, TLS...).
		throw new DeployError("network", (error as Error).message, {
			code: "E_TRANSPORT",
			details: { url: maskToken(url) },
		});
	}
}

function finalizeTransportError(error: unknown, maxAttempts: number): unknown {
	if (error instanceof DeployError && error.code === "E_TRANSPORT") {
		return new DeployError(
			"network",
			`Request failed after ${maxAttempts} attempts: ${error.message}`,
			{ code: "E_NETWORK", details: error.details },
		);
	}
	return error;
}

/**
 * GET with one retry budget: transport errors and retriable statuses
 * back off with jitter, bounded by `maxAttempts` (default 3) for the
 * whole operation — never per layer.
 */
export async function httpGet(
	url: string,
	options: HttpOptions,
): Promise<{ status: number; text: string }> {
	return runWithRetry(() => httpOnce(url, options), {
		maxAttempts: options.maxAttempts,
		backoffBaseMs: options.backoffBaseMs,
		sleep: options.sleep,
		signal: options.signal,
		shouldRetry: isRetriableTransport,
		onRetry: info => options.onEvent?.({ kind: "retry", ...info }),
		finalizeError: finalizeTransportError,
	});
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
 * One retry budget covers transport errors and VK error code 6 ("too many
 * requests per second") for the whole call.
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

	return runWithRetry(
		async () => {
			const { text } = await httpOnce(url, options);
			const json = parseJsonBody(text, url);

			if (isRecord(json) && isRecord(json["error"])) {
				const error = json["error"];
				const code = Number(error["error_code"] ?? 0);

				if (code === 6) {
					// Retriable marker — finalized as a VK api error once the
					// budget runs out.
					throw new DeployError("network", "VK error 6 (rate limit)", {
						code: VK_RATE_LIMIT_RETRY,
						details: { error },
					});
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
		},
		{
			maxAttempts: options.maxAttempts,
			backoffBaseMs: options.backoffBaseMs,
			sleep: options.sleep,
			signal: options.signal,
			shouldRetry: error =>
				isRetriableTransport(error) ||
				(error instanceof DeployError && error.code === VK_RATE_LIMIT_RETRY),
			onRetry: info => options.onEvent?.({ kind: "retry", ...info }),
			finalizeError: (error, maxAttempts) => {
				if (error instanceof DeployError && error.code === VK_RATE_LIMIT_RETRY) {
					const vkError =
						(error.details as { error?: Record<string, unknown> } | undefined)?.error ??
						{};
					return new DeployError("api", `VK API error ${vkErrorMessage(vkError)}`, {
						code: 6,
						details: vkError,
					});
				}
				return finalizeTransportError(error, maxAttempts);
			},
		},
	);
}
