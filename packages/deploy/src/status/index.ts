/**
 * Program Status Protocol (OSC 7501) — pure report formatter.
 *
 * Spec: https://www.superlogical.com/rex/docs/build/program-status
 *
 * No I/O and no `process` access: the library builds the escape
 * sequences, the consumer decides where to write them (the CLI wires
 * stdout in `src/cli/status.ts`). Every return value is one complete
 * report; a malformed record returns an empty string, which is exactly
 * what a terminal would do with such a report — discard it whole — so
 * preempting the write is cheaper than sending it.
 *
 * Well-behaved terminals ignore unknown OSC sequences, so reports can be
 * sent without feature detection; the spec marks detection as optional.
 */

export type StatusState = "idle" | "working" | "done" | "blocked" | "error" | "clear";
export type StatusKind = "permission" | "question" | "auth";

/**
 * One record update. Ways to address the terminal's state space:
 * `{ state, id?, kind?, progress?, app?, title?, msg? }` — with state
 * `clear` the record (and everything beneath it) is removed instead.
 */
export interface StatusRecord {
	readonly state: StatusState;
	/** Path id (`build/test`); absent addresses the root record. */
	readonly id?: string;
	/** With `blocked` only. */
	readonly kind?: StatusKind;
	/** Integer 0..100, with `working`/`blocked` only. Absent = indeterminate. */
	readonly progress?: number;
	/** Stable machine name, e.g. `vkma-deploy`. */
	readonly app?: string;
	/** Short label (base64 UTF-8 on the wire). */
	readonly title?: string;
	/** One human-readable line (base64 UTF-8 on the wire). */
	readonly msg?: string;
}

/** Hard caps from the spec: exceeding any one discards the whole report. */
export const STATUS_LIMITS = {
	/** Whole sequence, OSC through ST. */
	report: 4096,
	msgEncoded: 2732,
	titleEncoded: 256,
	idTotal: 128,
	idSegment: 32,
	idDepth: 8,
	app: 32,
} as const;

const ID_SEGMENT = /^[A-Za-z0-9_.+-]{1,32}$/;
const APP = ID_SEGMENT;

/**
 * Free-text values are single-line: control characters anywhere in the
 * decoded text (U+0000–U+001F, U+007F, U+0080–U+009F, incl. newline and
 * tab) make the terminal discard the whole report. Replaced with a space.
 */
// Stripping control characters is this regex's entire job (the spec
// rejects reports carrying them) — the lint rule cannot know that.
// oxlint-disable-next-line eslint/no-control-regex
const CONTROL = /[\u0000-\u001f\u007f\u0080-\u009f]/g;

/**
 * Builds one full report (`ESC ] 7501 ; pairs ST`). Returns an empty
 * string when the record can never be accepted: unknown/missing state,
 * a malformed `id` or `app`, or a sequence that still exceeds the size
 * limit after dropping the free text.
 */
export function statusSequence(record: StatusRecord): string {
	const pairs: string[] = [`state=${record.state}`];
	if (record.id !== undefined) {
		if (!isId(record.id)) {
			return "";
		}
		pairs.push(`id=${record.id}`);
	}
	if (record.state === "blocked" && record.kind !== undefined) {
		pairs.push(`kind=${record.kind}`);
	}
	if (
		(record.state === "working" || record.state === "blocked") &&
		record.progress !== undefined &&
		Number.isInteger(record.progress) &&
		record.progress >= 0 &&
		record.progress <= 100
	) {
		pairs.push(`progress=${record.progress}`);
	}
	if (record.app !== undefined) {
		if (!APP.test(record.app)) {
			return "";
		}
		pairs.push(`app=${record.app}`);
	}
	// clear removes records; only state and id are meaningful on it.
	if (record.state !== "clear") {
		const msg = encodeText(record.msg, STATUS_LIMITS.msgEncoded);
		if (msg !== undefined) {
			pairs.push(`msg=${msg}`);
		}
		const title = encodeText(record.title, STATUS_LIMITS.titleEncoded);
		if (title !== undefined) {
			pairs.push(`title=${title}`);
		}
	}
	const sequence = `\x1b]7501;${pairs.join(":")}\x1b\\`;
	// encodeText caps msg/title and every other key is individually
	// bounded, so a fully validated report is always inside the cap
	// (~3,200 worst case vs the 4,096 limit).
	return sequence;
}

/** Single-line-ness + size cap on the wire. Blank after sanitizing = absent. */
function encodeText(text: string | undefined, limitEncoded: number): string | undefined {
	if (text === undefined || text === "") {
		return undefined;
	}
	let clean = text.replace(CONTROL, " ");
	if (clean.trim() === "") {
		return undefined;
	}
	let encoded = Buffer.from(clean, "utf8").toString("base64");
	while (Buffer.byteLength(encoded, "utf8") > limitEncoded) {
		// Code-unit stepping can split a surrogate pair, which the terminal
		// then shows as U+FFFD — an eyesore at the cut, never a protocol
		// violation, and only reachable after 2048 decoded chars of msg.
		clean = clean.slice(0, -1);
		if (clean === "") {
			return undefined;
		}
		encoded = Buffer.from(clean, "utf8").toString("base64");
	}
	return encoded;
}

function isId(id: string): boolean {
	const segments = id.split("/");
	if (segments.length < 1 || segments.length > STATUS_LIMITS.idDepth) {
		return false;
	}
	if (Buffer.byteLength(id, "utf8") > STATUS_LIMITS.idTotal) {
		return false;
	}
	return segments.every(segment => ID_SEGMENT.test(segment));
}
