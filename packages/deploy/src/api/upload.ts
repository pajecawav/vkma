/**
 * Bundle upload: multipart POST with real byte-level progress.
 *
 * The VK upload endpoint expects a single `file` field with a zip body.
 * We build the multipart envelope manually and stream it through a counting
 * ReadableStream so progress reporting works with native fetch (no deps).
 */

import { randomBytes } from "node:crypto";
import { DeployError } from "../errors.ts";
import { parseJsonBody, type FetchLike, type HttpOptions } from "./client.ts";

export interface UploadOptions extends HttpOptions {
	/** Called at most every `progressIntervalMs` (plus the final call). */
	readonly onProgress?: (sent: number, total: number) => void;
	readonly progressIntervalMs?: number;
}

const CHUNK_SIZE = 64 * 1024;
const DEFAULT_PROGRESS_INTERVAL_MS = 50;

function buildMultipartBody(
	field: string,
	filename: string,
	data: Uint8Array,
	boundary: string,
): Uint8Array {
	const encoder = new TextEncoder();
	const head = encoder.encode(
		`--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\nContent-Type: application/zip\r\n\r\n`,
	);
	const tail = encoder.encode(`\r\n--${boundary}--\r\n`);
	const body = new Uint8Array(head.length + data.length + tail.length);
	body.set(head, 0);
	body.set(data, head.length);
	body.set(tail, head.length + data.length);
	return body;
}

function countingStream(
	body: Uint8Array,
	onProgress: (sent: number, total: number) => void,
	intervalMs: number,
): ReadableStream<Uint8Array> {
	let offset = 0;
	let sent = 0;
	let lastReport = 0;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (offset >= body.length) {
				onProgress(body.length, body.length);
				controller.close();
				return;
			}
			const chunk = body.subarray(offset, Math.min(offset + CHUNK_SIZE, body.length));
			offset += chunk.length;
			sent += chunk.length;
			const now = Date.now();
			if (now - lastReport >= intervalMs || sent === body.length) {
				lastReport = now;
				onProgress(sent, body.length);
			}
			controller.enqueue(chunk);
		},
	});
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

/**
 * Uploads `archive` to the presigned `uploadUrl` and returns the parsed JSON
 * response (which later gets base64-encoded into `upload_response`).
 */
export async function uploadBundle(
	uploadUrl: string,
	archive: Uint8Array,
	options: UploadOptions = {},
): Promise<Record<string, unknown>> {
	const maxAttempts = options.maxAttempts ?? 3;
	const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
	const sleep =
		options.sleep ?? ((ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)));
	const progressInterval = options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;

	let lastError: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		if (options.signal?.aborted) {
			throw new DeployError("aborted", "Upload aborted", { code: "E_ABORTED" });
		}
		try {
			const boundary = `----vkmaDeploy${randomBytes(12).toString("hex")}`;
			const body = buildMultipartBody("file", "bundle.zip", archive, boundary);
			options.onEvent?.({ kind: "request", method: "POST", url: uploadUrl });

			const response = await fetchImpl(uploadUrl, {
				method: "POST",
				headers: {
					"content-type": `multipart/form-data; boundary=${boundary}`,
					"content-length": String(body.length),
				},
				body: options.onProgress
					? countingStream(body, options.onProgress, progressInterval)
					: (body as BodyInit),
				signal: options.signal,
				// Required by undici when the body is a stream.
				duplex: "half",
			} as RequestInit);

			const text = await response.text();
			options.onEvent?.({ kind: "response", status: response.status });

			if (response.ok) {
				return parseJsonBody(text, uploadUrl) as Record<string, unknown>;
			}
			if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
				options.onEvent?.({
					kind: "retry",
					attempt,
					maxAttempts,
					error: `HTTP ${response.status}`,
				});
				await sleep((options.backoffBaseMs ?? 500) * 2 ** (attempt - 1));
				continue;
			}
			throw new DeployError(
				"network",
				`Upload failed: HTTP ${response.status} ${response.statusText}`.trim(),
				{
					code: `HTTP_${response.status}`,
				},
			);
		} catch (error) {
			if (isAbortError(error) || options.signal?.aborted) {
				throw new DeployError("aborted", "Upload aborted", { code: "E_ABORTED" });
			}
			if (error instanceof DeployError) {
				throw error;
			}
			if (attempt < maxAttempts) {
				options.onEvent?.({
					kind: "retry",
					attempt,
					maxAttempts,
					error: (error as Error).message,
				});
				await sleep((options.backoffBaseMs ?? 500) * 2 ** (attempt - 1));
				continue;
			}
			lastError = error;
			break;
		}
	}
	throw new DeployError(
		"network",
		`Upload failed after ${maxAttempts} attempts: ${(lastError as Error)?.message ?? "unknown error"}`,
		{
			code: "E_NETWORK",
		},
	);
}
