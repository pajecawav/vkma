import { describe, expect, it, vi } from "vitest";
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
		expect(out.join("")).toContain("vk.ru:  https://app");
	});

	it("aligns URL columns across differently sized platform labels", () => {
		const { logger, out } = makeLogger();
		logger.urlsBlock("dev", {
			iframe_secure_url: "https://a",
			vk_app_dev_url: "https://b",
			vk_mini_app_mvk_dev_url: "https://c",
		});
		const lines = out.filter(line => line.includes("https://"));
		const columns = lines.map(line => line.indexOf("https://"));
		expect(columns.every(column => column === columns[0])).toBe(true);
		expect(lines[0]?.trimEnd()).toBe("vk.ru:          https://a");
		expect(lines[1]?.trimEnd()).toBe("iOS & Android:  https://b");
		expect(lines[2]?.trimEnd()).toBe("m.vk.ru:        https://c");
	});

	it("renders raw URL keys in CI_URLS mode", () => {
		const { logger, out } = makeLogger();
		logger.setCiUrls(true);
		logger.urlsBlock("dev", { vk_app_dev_url: "https://dev" });
		expect(out.join("")).toContain("vk_app_dev_url=https://dev");
	});

	it("actionRequired renders bold with air around it (pretty)", () => {
		const out: string[] = [];
		const logger = new CliLogger({
			mode: "pretty",
			color: true,
			level: "info",
			redactor: createRedactor(),
			stdout: { write: text => out.push(text), isTTY: true },
			stderr: { write: () => {} },
		});
		logger.actionRequired("Confirm the deploy on your phone");
		const text = out.join("");
		expect(text).toContain("\x1b[1mConfirm the deploy on your phone\x1b[0m");
		// Air: a blank line before and after.
		expect(text.startsWith("\n")).toBe(true);
	});

	it("actionRequired emits a structured event in json mode", () => {
		const { logger, out } = makeLogger({ mode: "json" });
		logger.actionRequired("Confirm the deploy on your phone");
		const record = JSON.parse(out[0] ?? "{}") as { event: string; message: string };
		expect(record.event).toBe("action_required");
		expect(record.message).toBe("Confirm the deploy on your phone");
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

	it("spinnerStart on a spinning line swaps the text instead of stacking timers", () => {
		vi.useFakeTimers();
		try {
			const out: string[] = [];
			const logger = new CliLogger({
				mode: "pretty",
				color: false,
				level: "info",
				redactor: createRedactor(),
				stdout: { write: text => out.push(text), isTTY: true },
				stderr: { write: () => {} },
			});
			logger.spinnerStart("First phase");
			logger.spinnerStart("Second phase");
			// One interval, one frame per 80 ms tick. A second timer would
			// print two frames per tick and leak after spinnerStop.
			const frames = () => out.filter(text => text.startsWith("\r"));
			vi.advanceTimersByTime(80);
			expect(frames().length).toBe(1);
			expect(frames().join("")).toContain("Second phase");
			vi.advanceTimersByTime(80 * 5);
			expect(frames().length).toBe(6);
			expect(logger.spinnerActive).toBe(true);
			logger.spinnerStop();
			expect(logger.spinnerActive).toBe(false);
		} finally {
			vi.useRealTimers();
		}
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

	it("erases each progress frame so shorter frames leave no ghost tail", () => {
		// A retry drops the speed text and a unit boundary ("999.9 KB" ->
		// "1.0 MB") shrinks the sizes. Both make a frame shorter than its
		// predecessor, and without an erase sequence the tail would glue
		// onto the new frame ("1.7 MB/s   /s" was a real report).
		const out: string[] = [];
		const logger = new CliLogger({
			mode: "pretty",
			color: false,
			level: "info",
			redactor: createRedactor(),
			stdout: { write: text => out.push(text), isTTY: true },
			stderr: { write: () => {} },
		});
		logger.progress(900 * 1024 * 1024, 999 * 1024 * 1024);
		logger.progress(999.9 * 1024, 999 * 1024 * 1024);
		logger.progress(1024, 999 * 1024 * 1024);
		// The final newline of a finished bar is not a frame.
		const frames = out.filter(text => text !== "\n");
		expect(frames.length).toBeGreaterThan(0);
		for (const frame of frames) {
			expect(frame.startsWith("\r\x1b[2K")).toBe(true);
		}
	});

	it("shrinks the progress bar to fit a narrow terminal in one line", () => {
		// A frame wider than the terminal wraps, and \r can only redraw
		// the last screen line. Earlier wrapped lines would linger as
		// progress-history ghosts.
		const out: string[] = [];
		const logger = new CliLogger({
			mode: "pretty",
			color: false,
			level: "info",
			redactor: createRedactor(),
			stdout: { write: text => out.push(text), isTTY: true, columns: 60 },
			stderr: { write: () => {} },
		});
		logger.progress(400 * 1024 * 1024, 999 * 1024 * 1024);
		expect(out.join("")).toContain("Uploading [");
		// Visible width (the leading erase sequence is not screen width).
		const erase = "\r\x1b[2K";
		const first = out[0] ?? "";
		const visible = first.startsWith(erase) ? first.slice(erase.length) : first;
		expect(visible.length).toBeLessThanOrEqual(60);
		// The bar itself shrinks; trimming trailing spaces alone would
		// leave this line longer.
		expect(visible).toMatch(/\[[#]{4,}[-]{4,}\]/);
	});

	it("keeps the speed text visible between rate recomputations", async () => {
		// The rate mark recomputes at most every 300 ms; frames in between
		// are far more frequent (per-chunk events) and must still draw the
		// last computed speed instead of blinking it away.
		const MB = 1024 * 1024;
		const out: string[] = [];
		const logger = new CliLogger({
			mode: "pretty",
			color: false,
			level: "info",
			redactor: createRedactor(),
			stdout: { write: text => out.push(text), isTTY: true },
			stderr: { write: () => {} },
		});
		const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
		logger.progress(0, 10 * MB); // no mark yet, no speed
		await sleep(350);
		logger.progress(2 * MB, 10 * MB); // window passed, speed computed and drawn
		const speedFrames = out.slice(-1);
		expect(speedFrames.join("")).toMatch(/[\d.]+ [KMG]?B\/s/);
		// Two fast frames (< 300 ms apart): the sticky speed stays drawn.
		logger.progress(3 * MB, 10 * MB);
		logger.progress(4 * MB, 10 * MB);
		const recent = out.slice(-2).join("");
		expect(recent).toMatch(/[\d.]+ [KMG]?B\/s/);
	});

	it("shows no speed for instant progress bursts below the rate window", async () => {
		// Per-chunk frames arriving within the 300 ms window must not
		// invent a speed out of a single-mark sample.
		const out: string[] = [];
		const logger = new CliLogger({
			mode: "pretty",
			color: false,
			level: "info",
			redactor: createRedactor(),
			stdout: { write: text => out.push(text), isTTY: true },
			stderr: { write: () => {} },
		});
		logger.progress(1, 1000);
		logger.progress(2, 1000);
		logger.progress(3, 1000);
		expect(out.join("")).not.toContain("/s");
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
