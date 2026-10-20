import { describe, expect, it } from "vitest";
import { DeployError } from "../errors.ts";
import { createFetchSpy, sequence, instantSleep } from "../test-utils.ts";
import { uploadBundle } from "./upload.ts";

const ARCHIVE = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3, 4, 5]);

describe("uploadBundle", () => {
	it("POSTs a correct multipart body with the file field", async () => {
		const spy = createFetchSpy(() => ({ body: { ticket: "t-1" } }));
		const progress: { sent: number; total: number }[] = [];
		const result = await uploadBundle("https://upload.vk/", ARCHIVE, {
			fetchImpl: spy.fetchImpl,
			onProgress: (sent, total) => progress.push({ sent, total }),
			progressIntervalMs: 0,
		});

		expect(result).toEqual({ ticket: "t-1" });
		expect(spy.calls[0]?.init?.redirect).toBe("error");
		const call = spy.calls[0];
		expect(call?.init?.method).toBe("POST");
		const headers = (call?.init?.headers ?? {}) as Record<string, string>;
		const contentType = headers["content-type"] ?? "";
		expect(contentType).toMatch(/^multipart\/form-data; boundary=----vkmaDeploy[0-9a-f]+$/);
		const boundary = contentType.split("boundary=")[1] ?? "";
		const bodyText = new TextDecoder().decode(call?.bodyBytes ?? new Uint8Array());
		expect(bodyText.startsWith(`--${boundary}\r\n`)).toBe(true);
		expect(bodyText).toContain(
			'Content-Disposition: form-data; name="file"; filename="build.zip"',
		);
		expect(bodyText).toContain("Content-Type: application/zip");
		expect(bodyText.endsWith(`\r\n--${boundary}--\r\n`)).toBe(true);
		expect(Number(headers["content-length"] ?? "0")).toBe(
			(call?.bodyBytes ?? new Uint8Array()).length,
		);
		expect(bodyText).toContain(new TextDecoder().decode(ARCHIVE));
		const completions = progress.filter(entry => entry.sent === entry.total);
		expect(completions.length).toBe(1);
		expect(progress.at(-1)).toEqual({
			sent: (call?.bodyBytes ?? new Uint8Array()).length,
			total: (call?.bodyBytes ?? new Uint8Array()).length,
		});
	});

	it("retries on 5xx and succeeds", async () => {
		const spy = createFetchSpy(sequence({ status: 502, body: "boom" }, { body: { ok: 1 } }));
		const result = await uploadBundle("https://upload.vk/", ARCHIVE, {
			fetchImpl: spy.fetchImpl,
			sleep: instantSleep,
			backoffBaseMs: 0,
		});
		expect(result).toEqual({ ok: 1 });
		expect(spy.calls.length).toBe(2);
	});

	it("fails immediately on non-retriable statuses", async () => {
		const spy = createFetchSpy(() => ({ status: 403, body: "denied" }));
		await expect(
			uploadBundle("https://upload.vk/", ARCHIVE, {
				fetchImpl: spy.fetchImpl,
				sleep: instantSleep,
			}),
		).rejects.toSatisfy((error: unknown) => (error as DeployError).code === "HTTP_403");
		expect(spy.calls.length).toBe(1);
	});

	it("rejects HTML responses", async () => {
		const spy = createFetchSpy(() => ({ body: "<html>no</html>" }));
		await expect(
			uploadBundle("https://upload.vk/", ARCHIVE, {
				fetchImpl: spy.fetchImpl,
				sleep: instantSleep,
			}),
		).rejects.toSatisfy((error: unknown) => (error as DeployError).code === "E_HTML_RESPONSE");
	});

	it("reports aborted uploads", async () => {
		const spy = createFetchSpy(() => ({ body: {} }));
		const controller = new AbortController();
		controller.abort();
		await expect(
			uploadBundle("https://upload.vk/", ARCHIVE, {
				fetchImpl: spy.fetchImpl,
				sleep: instantSleep,
				signal: controller.signal,
			}),
		).rejects.toSatisfy((error: unknown) => (error as DeployError).kind === "aborted");
	});
});
