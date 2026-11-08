/**
 * CLI-side emitter for the Program Status Protocol (OSC 7501).
 *
 * The library never touches `process` (invariant #2), so the writing
 * lives here: the pure formatter (`src/status`) builds each report and
 * this reporter decides when one goes out — only on a real terminal
 * (stdout is a TTY), never in `--json` (machine-readable stdout must
 * stay escape-free), and never when `--no-status` or the `VKMA_NO_STATUS`
 * env var opted out. Messages pass through the redactor before encoding,
 * so a leaked token cannot survive into a status record either
 * (invariant #3).
 *
 * Every report replaces its record completely (`app` is therefore resent
 * every time), and the reporter remembers the last `working` record so a
 * prompt can hand control back with `resume()`.
 */

import { isDeployError } from "../errors.ts";
import { statusSequence, type StatusKind, type StatusRecord } from "../status/index.ts";

export interface StatusReporterOptions {
	readonly stdout: { write(text: string): void; isTTY?: boolean };
	readonly env: Record<string, string | undefined>;
	/** `--json`: stdout is machine-readable; escape bytes would corrupt it. */
	readonly json?: boolean;
	/** `--no-status`. */
	readonly disabled?: boolean;
	/** Stable app name carried on every report, e.g. `vkma-deploy`. */
	readonly app?: string;
	/** Applied to every free-text field before it is encoded. */
	readonly redact?: (text: string) => string;
}

export class StatusReporter {
	private readonly enabled: boolean;
	private readonly app?: string;
	private readonly redact: (text: string) => string;
	private readonly stdout: { write(text: string): void };

	/** Working record to hand back to after a `blocked` prompt. */
	private lastWorking: { msg?: string; progress?: number } | undefined;
	/** Last written working record, for percent-change dedupe. */
	private lastSent: { msg?: string; progress?: number } | undefined;

	public constructor(options: StatusReporterOptions) {
		this.enabled =
			options.stdout.isTTY === true &&
			options.json !== true &&
			options.disabled !== true &&
			options.env["VKMA_NO_STATUS"] === undefined;
		this.app = options.app;
		this.redact = options.redact ?? ((text: string) => text);
		this.stdout = options.stdout;
	}

	/** Running; remembered so a prompt can hand control back. */
	public working(msg?: string, progress?: number): void {
		this.lastWorking = { msg, progress };
		if (sameAs(this.lastSent, msg, progress)) {
			return;
		}
		this.lastSent = { msg, progress };
		this.send({ state: "working", msg, progress });
	}

	/** Waiting on the user; `resume()` continues the remembered work. */
	public blocked(kind: StatusKind, msg?: string): void {
		// The prompt may outlive the answer cycle of an identical-looking
		// message, so the dedupe state is dropped: resume() must resend.
		this.lastSent = undefined;
		this.send({ state: "blocked", kind, msg });
	}

	/** Continues the remembered `working` record from before a prompt. */
	public resume(): void {
		if (this.lastWorking === undefined) {
			// Nothing to hand back to (e.g. a prompt before the first
			// working report): the next report the run emits replaces the
			// blocked record anyway.
			return;
		}
		const { msg, progress } = this.lastWorking;
		this.lastSent = { msg, progress };
		this.send({ state: "working", msg, progress });
	}

	/** Finished; the record survives process exit (spec: done). */
	public done(msg?: string): void {
		this.lastWorking = undefined;
		this.lastSent = undefined;
		this.send({ state: "done", msg });
	}

	/** Failed and stopped; survives process exit (spec: error). */
	public error(msg?: string): void {
		this.lastWorking = undefined;
		this.lastSent = undefined;
		this.send({ state: "error", msg });
	}

	/** The user interrupted or canceled the run (spec: report idle). */
	public idle(msg?: string): void {
		this.lastWorking = undefined;
		this.lastSent = undefined;
		this.send({ state: "idle", msg });
	}

	/**
	 * Maps an exiting error onto the end states: a cancel (exit 130,
	 * including SIGINT) is an interrupt → `idle`; everything else →
	 * `error` right before exit, so a record is left behind to find.
	 */
	public failed(error: unknown): void {
		if (isDeployError(error) && error.kind === "aborted") {
			this.idle("Canceled");
			return;
		}
		const message = error instanceof Error ? error.message : String(error);
		this.error(message);
	}

	private send(record: Omit<StatusRecord, "app">): void {
		if (!this.enabled) {
			return;
		}
		const sequence = statusSequence({
			...record,
			app: this.app,
			msg: record.msg === undefined ? undefined : this.redact(record.msg),
		});
		if (sequence !== "") {
			this.stdout.write(sequence);
		}
	}
}

function sameAs(
	last: { msg?: string; progress?: number } | undefined,
	msg: string | undefined,
	progress: number | undefined,
): boolean {
	return last !== undefined && last.msg === msg && last.progress === progress;
}
