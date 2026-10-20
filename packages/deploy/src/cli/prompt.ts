/**
 * Minimal readline prompts (confirm / text).
 *
 * Prompts exist only behind --interactive (or for the event-205 confirmation
 * code, which cannot be known in advance). Without a TTY they throw a `user`
 * DeployError instead of hanging — CI pipelines never get stuck.
 */

import readline from "node:readline/promises";
import { DeployError } from "../errors.ts";

export interface PromptOptions {
	readonly signal?: AbortSignal;
	readonly stdin?: { isTTY?: boolean };
	readonly input?: NodeJS.ReadableStream;
	readonly output?: { write(text: string): void };
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
	const rl = readline.createInterface({
		input: options.input ?? process.stdin,
		output: (options.output ?? process.stdout) as NodeJS.WritableStream,
	});
	try {
		const hint = defaultValue ? "Y/n" : "y/N";
		const answer = (await ask(rl, `${question} (${hint}) `, options.signal))
			.trim()
			.toLowerCase();
		if (answer === "") {
			return defaultValue;
		}
		return answer === "y" || answer === "yes";
	} finally {
		rl.close();
	}
}

export async function text(question: string, options: PromptOptions = {}): Promise<string> {
	requireTty(options);
	const rl = readline.createInterface({
		input: options.input ?? process.stdin,
		output: (options.output ?? process.stdout) as NodeJS.WritableStream,
	});
	try {
		return (await ask(rl, `${question} `, options.signal)).trim();
	} finally {
		rl.close();
	}
}
