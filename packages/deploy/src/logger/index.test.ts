import { describe, expect, it } from "vitest";
import { createRedactor } from "../redact.ts";
import { CliLogger, formatBytes } from "./index.ts";

function createMemoryStreams(): {
	out: string[];
	err: string[];
	stdout: { write(text: string): void; isTTY?: boolean };
	stderr: { write(text: string): void };
} {
	const out: string[] = [];
	const err: string[] = [];
	return {
		out,
		err,
		stdout: { write: text => out.push(text), isTTY: false },
		stderr: { write: text => err.push(text) },
	};
}

function makeLogger(
	options: Partial<{
		mode: "pretty" | "json" | "quiet";
		level: "debug" | "info" | "warn" | "error";
	}> = {},
) {
	const streams = createMemoryStreams();
	const logger = new CliLogger({
		mode: options.mode ?? "pretty",
		color: false,
		level: options.level ?? "info",
		redactor: createRedactor(),
		stdout: streams.stdout,
		stderr: streams.stderr,
	});
	return { logger, ...streams };
}

describe("CliLogger", () => {
	it("pretty mode routes info to stdout and errors to stderr", () => {
		const { logger, out, err } = makeLogger();
		logger.info("hello");
		logger.error("boom");
		expect(out).toEqual(["hello\n"]);
		expect(err).toEqual(["boom\n"]);
	});

	it("quiet mode only writes errors", () => {
		const { logger, out, err } = makeLogger({ mode: "quiet" });
		logger.info("hello");
		logger.warn("careful");
		logger.error("boom");
		expect(out).toEqual([]);
		expect(err).toEqual(["boom\n"]);
	});

	it("json mode emits one parseable record per line", () => {
		const { logger, out } = makeLogger({ mode: "json" });
		logger.step("done", { version: 5 });
		const lines = out.map(line => JSON.parse(line));
		expect(lines[0]).toMatchObject({
			level: "info",
			event: "step",
			message: expect.stringContaining("done"),
		});
		expect((lines[0] as { data: { version: number } }).data.version).toBe(5);
	});

	it("json mode redacts secrets in data", () => {
		const { logger, out } = makeLogger({ mode: "json" });
		logger.info("request", { url: "https://x/?access_token=super-secret-token" });
		const line = out[0] ?? "";
		expect(line).not.toContain("super-secret-token");
		expect(line).toContain("access_token=***");
	});

	it("respects the level filter", () => {
		const { logger, out, err } = makeLogger({ level: "warn" });
		logger.debug("d");
		logger.info("i");
		logger.warn("w");
		expect(out).toEqual([]);
		expect(err).toEqual(["w\n"]);
	});

	it("renders URL blocks with platform labels by default", () => {
		const { logger, out } = makeLogger();
		logger.urlsBlock("production", { iframe_secure_url: "https://app" });
		expect(out.join("")).toContain("URLs changed for production:");
		expect(out.join("")).toContain("vk.ru:\thttps://app");
	});

	it("renders raw URL keys in CI_URLS mode", () => {
		const { logger, out } = makeLogger();
		logger.setCiUrls(true);
		logger.urlsBlock("dev", { vk_app_dev_url: "https://dev" });
		expect(out.join("")).toContain("vk_app_dev_url=https://dev");
	});

	it("reports failures with the error message", () => {
		const { logger, err } = makeLogger();
		logger.fail(new Error("kaboom"), false);
		expect(err.join("")).toContain("kaboom");
	});

	it("redacts registered secrets in message text, not only in data (json)", () => {
		const { logger, out } = makeLogger({ mode: "json" });
		logger.addSecret("tok-message-secret");
		logger.info("failed with tok-message-secret inside");
		const line = out[0] ?? "";
		expect(line).not.toContain("tok-message-secret");
	});

	it("redacts registered secrets in message text (pretty)", () => {
		const { logger, out } = makeLogger();
		logger.addSecret("tok-message-secret");
		logger.info("failed with tok-message-secret inside");
		expect(out.join("")).not.toContain("tok-message-secret");
	});

	it("masks access_token query params in message text", () => {
		const { logger, out } = makeLogger();
		logger.info("GET https://x/method?access_token=abc&v=5.199");
		expect(out.join("")).toContain("access_token=***");
	});

	it("redacts secrets in fail() messages too", () => {
		const { logger, err } = makeLogger();
		logger.addSecret("tok-message-secret");
		logger.fail(new Error("boom: tok-message-secret"), false);
		expect(err.join("")).not.toContain("tok-message-secret");
	});

	it("rawOut bypasses redaction for values the user must see in full", () => {
		const { logger, out } = makeLogger();
		logger.addSecret("AC123");
		logger.rawOut("Open this URL:\n  https://oauth.vk.ru/code_auth?code=AC123&revoke=1");
		expect(out.join("")).toContain("code=AC123");
	});

	it("suppresses progress output for non-interactive pretty mode", () => {
		const { logger, out } = makeLogger();
		logger.progress(50, 100);
		expect(out).toEqual([]);
	});

	it("never shows negative speed after an upload retry restarts from zero", () => {
		const out: string[] = [];
		const logger = new CliLogger({
			mode: "pretty",
			color: false,
			level: "info",
			redactor: createRedactor(),
			stdout: { write: text => out.push(text), isTTY: true },
			stderr: { write: () => {} },
		});
		logger.progress(900, 1000);
		logger.progress(10, 1000);
		expect(out.join("")).not.toMatch(/ -[\d.]+/);
	});

	it("prints on a fresh line while the spinner is running and resumes it", () => {
		const out: string[] = [];
		const err: string[] = [];
		const logger = new CliLogger({
			mode: "pretty",
			color: false,
			level: "debug",
			redactor: createRedactor(),
			stdout: { write: text => out.push(text), isTTY: true },
			stderr: { write: text => err.push(text) },
		});
		logger.spinnerStart("Waiting for hosting queue…");
		expect(logger.spinnerActive).toBe(true);
		logger.debug('← 200 {"ts":"1"}');
		const text = out.join("");
		// The spinner line is cleared first, so frames cannot glue onto
		// the printed line ("Waiting…GET -> 200" was a real-world report).
		expect(text).toContain("\r\x1b[2K← 200");
		expect(text).toContain('← 200 {"ts":"1"}\n');
		// The animation resumes afterwards and stops cleanly.
		expect(logger.spinnerActive).toBe(true);
		logger.spinnerStop();
		expect(logger.spinnerActive).toBe(false);
	});
});

describe("formatBytes", () => {
	it("formats human-readable sizes", () => {
		expect(formatBytes(512)).toBe("512 B");
		expect(formatBytes(2048)).toBe("2.0 KB");
		expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
	});
});
