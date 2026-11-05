/**
 * Minimal readline prompts (confirm / text).
 *
 * Prompts exist only behind --interactive, with four exceptions, all
 * TTY-only: the update-flag confirms (answers feed the wire params via
 * the "prompt" config source), the pre-deploy confirmation, the
 * event-205 confirmation code (which cannot be known in advance), and
 * the init wizard (a scaffold command whose whole job is asking; its
 * non-TTY runs take values from flags instead, E_NO_TTY otherwise).
 * Without a TTY they throw a `user` DeployError instead of hanging.
 * CI pipelines never get stuck.
 *
 * One readline interface is shared per input stream: sequential prompts
 * (pre-deploy confirm, then the 205 code) on a freshly created interface
 * never fire on non-TTY streams, because rl.close() leaves the stream
 * paused for the next interface. The binary entry closes the shared
 * interfaces after main() resolves so the process can exit.
 */

import readline from "node:readline/promises";
import { DeployError } from "../errors.ts";
import { paint, type ColorName } from "../logger/color.ts";

export interface PromptOptions {
	readonly signal?: AbortSignal;
	readonly stdin?: { isTTY?: boolean };
	readonly input?: NodeJS.ReadableStream;
	readonly output?: { write(text: string): void };
	/** Paints the whole question (including the Y/n hint) in this color.
	 * Passed only when colors are enabled at all. The caller owns the
	 * TTY / NO_COLOR / --no-color decision, never this module. */
	readonly questionColor?: ColorName;
}

function requireTty(options: PromptOptions): void {
	const stdin = options.stdin ?? process.stdin;
	if (stdin.isTTY !== true) {
		throw new DeployError(
			"user",
			"Prompt requested but stdin is not a TTY. Pass the value via a flag, env var, or config file instead.",
			{ code: "E_NO_TTY" },
		);
	}
}

const sharedInterfaces = new WeakMap<object, readline.Interface>();
const createdInterfaces: readline.Interface[] = [];

/**
 * readline needs an EventEmitter-ish output (`on`), but callers may pass
 * a plain `{ write }` double (MainOptions.stdout test mocks). Those get a
 * minimal adapter; `isTTY` is deliberately not forwarded so readline
 * stays in non-terminal mode and only ever calls `write`.
 */
function writableFor(output: { write(text: string): void }): NodeJS.WritableStream {
	const stream = output as NodeJS.WritableStream;
	if (typeof stream.on === "function") {
		return stream;
	}
	const adapter = {
		write: (text: string) => output.write(text),
		on: () => adapter,
		off: () => adapter,
	};
	return adapter as unknown as NodeJS.WritableStream;
}

function interfaceFor(options: PromptOptions): readline.Interface {
	const input: object = options.input ?? process.stdin;
	let rl = sharedInterfaces.get(input);
	if (rl === undefined) {
		rl = readline.createInterface({
			input: input as NodeJS.ReadableStream,
			output: writableFor(options.output ?? process.stdout),
		});
		sharedInterfaces.set(input, rl);
		createdInterfaces.push(rl);
	}
	return rl;
}

/** Closes every shared prompt interface so the process can exit. */
export function closeAllPrompts(): void {
	for (const rl of createdInterfaces.splice(0)) {
		rl.close();
	}
}

function isAbortError(error: unknown): boolean {
	return error instanceof Error && error.name === "AbortError";
}

/**
 * Asks one question; an aborted signal (Ctrl+C) rejects with an
 * `aborted` DeployError instead of leaving the question dangling.
 */
async function ask(
	rl: readline.Interface,
	query: string,
	signal: AbortSignal | undefined,
): Promise<string> {
	try {
		return await rl.question(query, { signal });
	} catch (error) {
		if (isAbortError(error) || signal?.aborted === true) {
			throw new DeployError("aborted", "Prompt canceled", { code: "E_ABORTED" });
		}
		throw error;
	}
}

export async function confirm(
	question: string,
	defaultValue = true,
	options: PromptOptions = {},
): Promise<boolean> {
	requireTty(options);
	const rl = interfaceFor(options);
	const hint = defaultValue ? "Y/n" : "y/N";
	const plain = `${question} (${hint}) `;
	const query =
		options.questionColor === undefined ? plain : paint(plain, options.questionColor, true);
	const answer = (await ask(rl, query, options.signal)).trim().toLowerCase();
	if (answer === "") {
		return defaultValue;
	}
	return answer === "y" || answer === "yes";
}

export async function text(question: string, options: PromptOptions = {}): Promise<string> {
	requireTty(options);
	const rl = interfaceFor(options);
	return (await ask(rl, `${question} `, options.signal)).trim();
}
