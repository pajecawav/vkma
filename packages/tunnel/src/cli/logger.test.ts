import { describe, expect, it } from "vitest";
import { TunnelLogger, type TunnelLoggerOptions } from "./logger.ts";

function makeLogger(overrides: Partial<TunnelLoggerOptions> = {}): {
	logger: TunnelLogger;
	out: string[];
	err: string[];
} {
	const out: string[] = [];
	const err: string[] = [];
	const logger = new TunnelLogger({
		mode: "pretty",
		color: false,
		stdout: { write: (text: string): void => void out.push(text), isTTY: false },
		stderr: { write: (text: string): void => void err.push(text) },
		...overrides,
	});
	return { logger, out, err };
}

describe("TunnelLogger", () => {
	it("pretty info writes plain lines to stdout", () => {
		const { logger, out, err } = makeLogger();
		logger.info("hello");
		expect(out).toEqual(["hello\n"]);
		expect(err).toEqual([]);
	});

	it("warn and error go to stderr", () => {
		const { logger, out, err } = makeLogger();
		logger.warn("careful");
		logger.fail("broken");
		expect(out).toEqual([]);
		expect(err).toEqual(["careful\n", "✖ broken\n"]);
	});

	it("quiet mode prints errors only, and the URL still passes through rawOut", () => {
		const { logger, out, err } = makeLogger({ mode: "quiet" });
		logger.info("noise");
		logger.warn("noise");
		logger.rawOut("https://abc.opentunnel.xyz\n");
		logger.fail("real problem");
		expect(out).toEqual(["https://abc.opentunnel.xyz\n\n"]);
		expect(err).toEqual(["✖ real problem\n"]);
	});

	it("json mode emits NDJSON records with time/level/event", () => {
		const { logger, out } = makeLogger({ mode: "json" });
		logger.emit({
			level: "info",
			event: "url",
			message: "https://x",
			data: { url: "https://x" },
		});
		const line = JSON.parse(out[0] ?? "{}") as Record<string, unknown>;
		expect(line["event"]).toBe("url");
		expect(line["level"]).toBe("info");
		expect(typeof line["time"]).toBe("string");
		expect(line["data"]).toEqual({ url: "https://x" });
	});

	it("json step renders as a structured record, not a ✔ line", () => {
		const { logger, out } = makeLogger({ mode: "json" });
		logger.step('Removed identity for profile "demo"');
		const line = JSON.parse(out[0] ?? "{}") as Record<string, unknown>;
		expect(line["event"]).toBe("step");
		expect(line["message"]).toBe('Removed identity for profile "demo"');
	});

	it("spinner on a non-TTY falls back to a plain info line", () => {
		const { logger, out } = makeLogger();
		logger.spinnerStart("Waiting for certificate issuance…");
		expect(out).toEqual(["Waiting for certificate issuance…\n"]);
	});

	it("spinner on a TTY animates and spinnerStop clears the line", async () => {
		const writes: string[] = [];
		const { logger } = makeLogger({
			stdout: { write: (text: string): void => void writes.push(text), isTTY: true },
		});
		logger.spinnerStart("Working…");
		// Let at least one 80ms animation frame render.
		await new Promise(resolve => {
			setTimeout(resolve, 120);
		});
		logger.spinnerStop();
		const joined = writes.join("");
		expect(joined).toContain("\x1b[?25l"); // hide cursor
		expect(joined).toContain("\x1b[?25h"); // show cursor
		expect(joined).toContain("\r\x1b[2K"); // clear line
		expect(joined).toContain("Working…"); // frame text
		expect(joined).toMatch(/\(\d+s\)/); // elapsed
	});

	it("step prefixes a green check when color is enabled", () => {
		const { logger, out } = makeLogger({ color: true });
		logger.step("done");
		expect(out[0]).toContain("✔");
		expect(out[0]).toContain("\x1b[32m");
	});
});
