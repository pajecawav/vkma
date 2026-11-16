/**
 * CLI logger for the tunnel: one pipeline, three renderers.
 *
 * Adapted from @vkma.dev/deploy's logger, slimmed for a long-running
 * foreground process:
 *
 * - pretty: colored steps, an elapsed-time spinner (first provisioning
 *   takes minutes), the URL banner, lifecycle lines (TTY)
 * - json:   newline-delimited event records (`vkma-tunnel --json | jq`)
 * - quiet:  errors only
 *
 * Colors respect NO_COLOR, --no-color, and TTY detection. There is no
 * redactor: tunnel output carries no secrets (the identity file never
 * reaches the log).
 */

export type LoggerMode = "pretty" | "json" | "quiet";
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
	readonly level: LogLevel;
	readonly event: string;
	readonly message: string;
	readonly data?: unknown;
}

export interface TunnelLoggerOptions {
	readonly mode: LoggerMode;
	readonly color: boolean;
	readonly stdout: { write(text: string): void; isTTY?: boolean; columns?: number };
	readonly stderr: { write(text: string): void };
}

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"] as const;

const ANSI = {
	bold: "\x1b[1m",
	dim: "\x1b[2m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	cyan: "\x1b[36m",
} as const;

export type PaintColor = keyof typeof ANSI;

export function paint(text: string, color: PaintColor, enabled: boolean): string {
	return enabled ? `${ANSI[color]}${text}\x1b[0m` : text;
}

/** Restores a visible cursor after the spinner hid it. Exported for the
 * binary entry, where a forced exit (second signal) must not leave the
 * terminal cursor-less. */
export const SHOW_CURSOR = "\x1b[?25h";

export class TunnelLogger {
	private readonly mode: LoggerMode;
	private readonly colorEnabled: boolean;
	private readonly stdout: TunnelLoggerOptions["stdout"];
	private readonly stderr: { write(text: string): void };

	private spinnerTimer: ReturnType<typeof setInterval> | undefined;
	private spinnerFrame = 0;
	private spinnerText = "";
	private spinnerStartedAt = 0;
	/** True while the spinner hid the cursor; stop-codes are emitted only then. */
	private cursorHidden = false;

	public constructor(options: TunnelLoggerOptions) {
		this.mode = options.mode;
		this.colorEnabled = options.color;
		this.stdout = options.stdout;
		this.stderr = options.stderr;
	}

	public get json(): boolean {
		return this.mode === "json";
	}

	private paint(text: string, color: PaintColor): string {
		return paint(text, color, this.colorEnabled);
	}

	private writeOut(text: string): void {
		this.stdout.write(`${text}\n`);
	}

	private writeErr(text: string): void {
		this.stderr.write(`${text}\n`);
	}

	public emit(record: LogRecord): void {
		if (this.mode === "json") {
			this.writeOut(
				JSON.stringify({
					time: new Date().toISOString(),
					level: record.level,
					event: record.event,
					message: record.message,
					...(record.data === undefined ? {} : { data: record.data }),
				}),
			);
			return;
		}
		if (this.mode === "quiet") {
			if (record.level === "error") {
				this.writeErr(this.paint(record.message, "red"));
			}
			return;
		}
		// Pretty: never print into a live spinner frame.
		const resume = this.pauseSpinner();
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
		resume();
	}

	public info(message: string, data?: unknown): void {
		this.emit({ level: "info", event: "info", message, data });
	}

	public warn(message: string, data?: unknown): void {
		this.emit({ level: "warn", event: "warn", message, data });
	}

	/** Green-check completion line. */
	public step(message: string, data?: unknown): void {
		if (this.mode === "json") {
			this.emit({ level: "info", event: "step", message, data });
			return;
		}
		const resume = this.pauseSpinner();
		if (this.mode === "quiet") {
			return;
		}
		this.writeOut(`${this.paint("✔", "green")} ${message}`);
		resume();
	}

	/** Writes text verbatim (QR art, JSON documents) without framing. */
	public rawOut(text: string): void {
		const resume = this.pauseSpinner();
		this.writeOut(text);
		resume();
	}

	// -- spinner -----------------------------------------------------------

	private get interactive(): boolean {
		return this.mode === "pretty" && this.stdout.isTTY === true;
	}

	public spinnerStart(text: string): void {
		if (!this.interactive) {
			// Non-TTY (pipes, CI): stage lines instead of animation. The
			// caller dedupes repeated stages, so each prints once.
			this.info(text);
			return;
		}
		// An already-spinning line just swaps its text (provisioning stage
		// changes); a second interval would print every frame twice.
		if (this.spinnerTimer !== undefined) {
			this.spinnerText = text;
			return;
		}
		this.spinnerText = text;
		this.spinnerStartedAt = Date.now();
		this.stdout.write("\x1b[?25l"); // hide cursor
		this.cursorHidden = true;
		this.startSpinnerTimer();
	}

	public spinnerUpdate(text: string): void {
		this.spinnerText = text;
	}

	/** One spinner frame: glyph + text + elapsed since spinner start. */
	private renderSpinnerFrame(): void {
		this.spinnerFrame = (this.spinnerFrame + 1) % SPINNER_FRAMES.length;
		const elapsed = Math.floor((Date.now() - this.spinnerStartedAt) / 1000);
		const frame = SPINNER_FRAMES[this.spinnerFrame] ?? "⠋";
		this.stdout.write(
			`\r${this.paint(frame, "cyan")} ${this.spinnerText} ${this.paint(`(${String(elapsed)}s)`, "dim")}`,
		);
	}

	private startSpinnerTimer(): void {
		this.spinnerTimer = setInterval(() => this.renderSpinnerFrame(), 80);
	}

	/**
	 * Suspends the spinner animation and returns a resumer; a no-op pair
	 * when nothing is spinning.
	 */
	private pauseSpinner(): () => void {
		if (this.spinnerTimer === undefined || !this.interactive) {
			return () => {};
		}
		clearInterval(this.spinnerTimer);
		this.spinnerTimer = undefined;
		this.clearLine();
		return () => {
			this.stdout.write("\x1b[?25l"); // keep the cursor hidden while spinning
			this.startSpinnerTimer();
		};
	}

	public spinnerStop(): void {
		if (this.spinnerTimer !== undefined) {
			clearInterval(this.spinnerTimer);
			this.spinnerTimer = undefined;
		}
		// Control codes only when the spinner actually ran: a plain
		// `list`/`status` run must not leak clear-line/show-cursor noise.
		if (this.cursorHidden) {
			this.clearLine();
			if (this.interactive) {
				this.stdout.write(SHOW_CURSOR);
			}
			this.cursorHidden = false;
		}
	}

	private clearLine(): void {
		if (this.interactive) {
			this.stdout.write("\r\x1b[2K");
		}
	}

	// -- errors --------------------------------------------------------------

	public fail(message: string): void {
		this.spinnerStop();
		if (this.mode === "json") {
			this.emit({ level: "error", event: "error", message });
			return;
		}
		this.writeErr(this.paint(`✖ ${message}`, "red"));
	}

	public dispose(): void {
		this.spinnerStop();
	}
}
