/**
 * Bundle upload: multipart POST with real byte-level progress.
 *
 * The VK upload endpoint expects a single `file` field with a zip body.
 * We build the multipart envelope manually and stream it through a counting
 * ReadableStream so progress reporting works with native fetch (no deps).
 */

import { randomBytes } from "node:crypto";
import { DeployError } from "../errors.ts";
import {
	parseJsonBody,
	bodyPreview,
	isRetriableTransport,
	type FetchLike,
	type HttpOptions,
} from "./client.ts";
import { runWithRetry } from "./retry.ts";

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
	let reportedSent = -1;
	return new ReadableStream<Uint8Array>({
		pull(controller) {
			if (offset >= body.length) {
				// The last chunk already reported completion; do not emit twice
				// (the duplicated "100%" line was a real-world report).
				if (reportedSent !== body.length) {
					onProgress(body.length, body.length);
				}
				controller.close();
				return;
			}
			const chunk = body.subarray(offset, Math.min(offset + CHUNK_SIZE, body.length));
			offset += chunk.length;
			sent += chunk.length;
			const now = Date.now();
			if (now - lastReport >= intervalMs || sent === body.length) {
				lastReport = now;
				reportedSent = sent;
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
	const fetchImpl: FetchLike = options.fetchImpl ?? fetch;
	const progressInterval = options.progressIntervalMs ?? DEFAULT_PROGRESS_INTERVAL_MS;

	return runWithRetry(
		async () => {
			const boundary = `----vkmaDeploy${randomBytes(12).toString("hex")}`;
			// "build.zip" matches upstream's zip-a-folder output name exactly
			// (their default bundleFile) — one less wire difference.
			const body = buildMultipartBody("file", "build.zip", archive, boundary);
			// User callbacks run outside the transport try (see httpOnce).
			options.onEvent?.({ kind: "request", method: "POST", url: uploadUrl });

			let response: Response;
			let text: string;
			try {
				response = await fetchImpl(uploadUrl, {
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
					// The upload URL comes from the VK API over HTTPS; a 3xx
					// must not walk the bundle (and any query secrets) elsewhere.
					redirect: "error",
				} as RequestInit);
				text = await response.text();
			} catch (error) {
				if (isAbortError(error) || options.signal?.aborted) {
					throw new DeployError("aborted", "Upload aborted", { code: "E_ABORTED" });
				}
				if (error instanceof DeployError) {
					throw error;
				}
				throw new DeployError("network", (error as Error).message, {
					code: "E_TRANSPORT",
					details: { url: uploadUrl },
				});
			}
			options.onEvent?.({
				kind: "response",
				status: response.status,
				body: bodyPreview(text),
			});

			if (response.ok) {
				return parseJsonBody(text, uploadUrl) as Record<string, unknown>;
			}
			throw new DeployError(
				"network",
				`Upload failed: HTTP ${response.status} ${response.statusText}`.trim(),
				{
					code: `HTTP_${response.status}`,
				},
			);
		},
		{
			maxAttempts: options.maxAttempts,
			backoffBaseMs: options.backoffBaseMs,
			sleep: options.sleep,
			signal: options.signal,
			shouldRetry: isRetriableTransport,
			onRetry: info => options.onEvent?.({ kind: "retry", ...info }),
			finalizeError: (error, maxAttempts) =>
				error instanceof DeployError && error.code === "E_TRANSPORT"
					? new DeployError(
							"network",
							`Upload failed after ${maxAttempts} attempts: ${error.message}`,
							{ code: "E_NETWORK", details: { url: uploadUrl } },
						)
					: error,
		},
	);
}
