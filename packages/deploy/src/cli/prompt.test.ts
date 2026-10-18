import { PassThrough } from "node:stream";
import { describe, expect, it } from "vitest";
import { DeployError } from "../errors.ts";
import { confirm, text } from "./prompt.ts";

function makeIO(): {
	input: PassThrough;
	output: { write(text: string): void };
	written: string[];
} {
	const input = new PassThrough();
	const written: string[] = [];
	return { input, written, output: { write: (t: string) => written.push(t) } };
}

describe("prompts", () => {
	it("confirm parses y/yes and falls back to the default on empty input", async () => {
		const { input, output, written } = makeIO();
		const first = confirm("Deploy?", false, { stdin: { isTTY: true }, input, output });
		input.write("\n");
		await expect(first).resolves.toBe(false);
		const second = confirm("Deploy?", true, { stdin: { isTTY: true }, input, output });
		input.write("YES\n");
		await expect(second).resolves.toBe(true);
		expect(written.join("")).toContain("Deploy? (y/N)");
		expect(written.join("")).toContain("Deploy? (Y/n)");
	});

	it("text returns the trimmed answer", async () => {
		const { input, output } = makeIO();
		const pending = text("Code:", { stdin: { isTTY: true }, input, output });
		input.write("  1234 \n");
		await expect(pending).resolves.toBe("1234");
	});

	it("throws E_NO_TTY when stdin is not a TTY", async () => {
		await expect(text("Q?", { stdin: { isTTY: false } })).rejects.toSatisfy(
			(error: unknown) => (error as DeployError).code === "E_NO_TTY",
		);
	});

	it("aborts cleanly when the signal fires while a question is pending", async () => {
		const { input, output } = makeIO();
		const controller = new AbortController();
		const pending = text("Code:", {
			stdin: { isTTY: true },
			input,
			output,
			signal: controller.signal,
		});
		await new Promise(resolve => setImmediate(resolve));
		controller.abort();
		await expect(pending).rejects.toSatisfy(
			(error: unknown) => (error as DeployError).kind === "aborted",
		);
	});
});
