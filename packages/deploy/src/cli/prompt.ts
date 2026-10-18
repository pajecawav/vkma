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
		const answer = (await rl.question(`${question} (${hint}) `)).trim().toLowerCase();
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
		return (await rl.question(`${question} `)).trim();
	} finally {
		rl.close();
	}
}
