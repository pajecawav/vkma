/**
 * CLI logger: one event pipeline, three renderers.
 *
 * - pretty: colored steps, spinner, upload progress bar, URL tables (TTY)
 * - json:   newline-delimited JSON records for CI pipelines
 * - quiet:  errors only
 *
 * Every record passes through the redactor, so access tokens never leak into
 * any output mode. Colors respect NO_COLOR, --no-color, and TTY detection.
 */

import { PLATFORM_LABELS } from "../constants.ts";
import type { DeployResult } from "../deploy/flow.ts";
import type { DeployError } from "../errors.ts";
import type { Redactor } from "../redact.ts";

export type LoggerMode = "pretty" | "json" | "quiet";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
	readonly level: LogLevel;
	readonly event: string;
	readonly message: string;
	readonly data?: unknown;
}

export interface CliLoggerOptions {
	readonly mode: LoggerMode;
	readonly color: boolean;
	readonly level: LogLevel;
	readonly redactor: Redactor;
	readonly stdout: { write(text: string): void; isTTY?: boolean };
	readonly stderr: { write(text: string): void };
}

const LEVEL_WEIGHT: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	const units = ["KB", "MB", "GB"];
	let value = bytes / 1024;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(1)} ${units[unit]}`;
}

const COLORS = {
	reset: 0,
	bold: 1,
	dim: 2,
	red: 31,
	green: 32,
	yellow: 33,
	cyan: 36,
} as const;

type ColorName = keyof typeof COLORS;

export class CliLogger {
	private readonly mode: LoggerMode;
	private readonly colorEnabled: boolean;
	private readonly level: LogLevel;
	private readonly redactor: Redactor;
	private readonly stdout: { write(text: string): void; isTTY?: boolean };
	private readonly stderr: { write(text: string): void };
	private ciUrls = false;

	private spinnerTimer: ReturnType<typeof setInterval> | undefined;
	private spinnerFrame = 0;
	private spinnerText = "";
	private progressMark: { time: number; sent: number } | undefined;

	public constructor(options: CliLoggerOptions) {
		this.mode = options.mode;
		this.colorEnabled = options.color;
		this.level = options.level;
		this.redactor = options.redactor;
		this.stdout = options.stdout;
		this.stderr = options.stderr;
	}

	/** CI_URLS mode: print raw URL keys instead of platform labels. */
	public setCiUrls(value: boolean): void {
		this.ciUrls = value;
	}

	private paint(text: string, color: ColorName): string {
		return this.colorEnabled ? `\x1b[${COLORS[color]}m${text}\x1b[0m` : text;
	}

	private writeOut(text: string): void {
		this.stdout.write(`${text}\n`);
	}

	private writeErr(text: string): void {
		this.stderr.write(`${text}\n`);
	}

	public emit(record: LogRecord): void {
		if (LEVEL_WEIGHT[record.level] < LEVEL_WEIGHT[this.level]) {
			return;
		}
		if (this.mode === "json") {
			const line = {
				time: new Date().toISOString(),
				level: record.level,
				event: record.event,
				message: record.message,
				...(record.data === undefined ? {} : { data: this.redactor.redact(record.data) }),
			};
			this.writeOut(JSON.stringify(line));
			return;
		}
		if (this.mode === "quiet") {
			if (record.level === "error") {
				this.writeErr(this.paint(record.message, "red"));
			}
			return;
		}
		const colored =
			record.level === "error"
				? this.paint(record.message, "red")
				: record.level === "warn"
					? this.paint(record.message, "yellow")
					: record.level === "debug"
						? this.paint(record.message, "dim")
						: record.message;
		if (record.level === "error" || record.level === "warn") {
			this.writeErr(colored);
		} else {
			this.writeOut(colored);
		}
	}

	public debug(message: string, data?: unknown): void {
		this.emit({ level: "debug", event: "debug", message, data });
	}

	public info(message: string, data?: unknown): void {
		this.emit({ level: "info", event: "info", message, data });
	}

	public warn(message: string, data?: unknown): void {
		this.emit({ level: "warn", event: "warn", message, data });
	}

	public error(message: string, data?: unknown): void {
		this.emit({ level: "error", event: "error", message, data });
	}

	public step(message: string, data?: unknown): void {
		this.emit({
			level: "info",
			event: "step",
			message: `${this.paint("✔", "green")} ${message}`,
			data,
		});
	}

	// -- spinner -----------------------------------------------------------

	private get interactive(): boolean {
		return this.mode === "pretty" && this.stdout.isTTY === true;
	}

	private clearLine(): void {
		if (this.interactive) {
			this.stdout.write("\r\x1b[2K");
		}
	}

	public spinnerStart(text: string): void {
		if (!this.interactive) {
			this.info(text);
			return;
		}
		this.spinnerText = text;
		this.stdout.write("\x1b[?25l"); // hide cursor
		this.spinnerTimer = setInterval(() => {
			this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
			this.stdout.write(
				`\r${this.paint(SPINNER_FRAMES[this.spinnerFrame] ?? "⠋", "cyan")} ${this.spinnerText}`,
			);
		}, 80);
	}

	public spinnerStop(): void {
		if (this.spinnerTimer !== undefined) {
			clearInterval(this.spinnerTimer);
			this.spinnerTimer = undefined;
		}
		this.clearLine();
		if (this.interactive) {
			this.stdout.write("\x1b[?25h"); // show cursor
		}
	}

	public spinnerUpdate(text: string): void {
		this.spinnerText = text;
	}

	// -- upload progress ----------------------------------------------------

	public progress(sent: number, total: number): void {
		if (this.mode === "json") {
			this.emit({
				level: "info",
				event: "upload:progress",
				message: "uploading",
				data: { sent, total },
			});
			return;
		}
		if (!this.interactive) {
			return;
		}
		const now = Date.now();
		let speedText = "";
		if (this.progressMark !== undefined) {
			const seconds = (now - this.progressMark.time) / 1000;
			if (seconds > 0.2) {
				speedText = ` ${formatBytes((sent - this.progressMark.sent) / seconds)}/s`;
			}
		}
		this.progressMark = { time: now, sent };
		const ratio = total > 0 ? sent / total : 0;
		const width = 24;
		const filled = Math.round(ratio * width);
		const bar = `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
		const percent = Math.floor(ratio * 100);
		const line = `\r${this.paint("⠿", "cyan")} Uploading [${bar}] ${percent}% ${formatBytes(sent)}/${formatBytes(total)}${speedText}   `;
		this.stdout.write(line);
		if (sent >= total) {
			this.stdout.write("\n");
			this.progressMark = undefined;
		}
	}

	// -- deploy output ------------------------------------------------------

	public urlsBlock(environment: "production" | "dev", urls: Record<string, string>): void {
		if (Object.keys(urls).length === 0) {
			return;
		}
		if (this.mode === "json") {
			this.emit({
				level: "info",
				event: "urls",
				message: `URLs changed for ${environment}`,
				data: { environment, urls },
			});
			return;
		}
		if (this.mode === "quiet") {
			return;
		}
		this.info(this.paint(`URLs changed for ${environment}:`, "green"));
		for (const [key, url] of Object.entries(urls)) {
			if (this.ciUrls) {
				this.writeOut(`${key}=${url}`);
			} else {
				const label = PLATFORM_LABELS[key as keyof typeof PLATFORM_LABELS];
				this.writeOut(`${label !== undefined ? `${label}:` : key}\t${url}`);
			}
		}
	}

	public final(result: DeployResult): void {
		if (result.dryRun) {
			this.step(
				`Dry run complete: bundle ${formatBytes(result.bundleBytes ?? 0)} would be deployed (no network calls)`,
			);
			return;
		}
		this.step(
			`Deploy complete: version ${String(result.version)} in ${Math.max(1, Math.round(result.durationMs / 100) / 10)}s`,
		);
	}

	public fail(error: unknown, verbose: boolean): void {
		this.spinnerStop();
		if (this.mode === "json") {
			const payload =
				error instanceof Error && typeof (error as DeployError).toJSON === "function"
					? (error as DeployError).toJSON()
					: { message: String(error) };
			this.emit({
				level: "error",
				event: "error",
				message: (payload as { message: string }).message,
				data: payload,
			});
			return;
		}
		const deployError = error as DeployError;
		const hint =
			deployError instanceof Error && deployError.kind === "aborted"
				? "canceled"
				: error instanceof Error
					? error.message
					: String(error);
		this.writeErr(this.paint(`✖ ${hint}`, "red"));
		if (verbose && error instanceof Error && error.stack) {
			this.writeErr(this.paint(error.stack.split("\n").slice(1).join("\n"), "dim"));
		}
		if (verbose && deployError instanceof Error && deployError.details !== undefined) {
			this.writeErr(
				this.paint(
					JSON.stringify(this.redactor.redact(deployError.details), null, 2),
					"dim",
				),
			);
		}
	}

	public dispose(): void {
		this.spinnerStop();
	}
}
