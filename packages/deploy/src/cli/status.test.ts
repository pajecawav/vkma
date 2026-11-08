import { describe, expect, it } from "vitest";
import { DeployError } from "../errors.ts";
import { StatusReporter } from "./status.ts";

const ESC_ST = "\x1b\\";
const prefix = "\x1b]7501;";

interface Harness {
	output: string[];
	reporter: StatusReporter;
	ttyOut: { write: (text: string) => void; isTTY: boolean };
}

/** stdout pretending to be an interactive terminal. */
function ttyReporter(
	options: Partial<ConstructorParameters<typeof StatusReporter>[0]> = {},
): Harness {
	const output: string[] = [];
	const ttyOut = { write: (text: string) => output.push(text), isTTY: true };
	const reporter = new StatusReporter({
		stdout: ttyOut,
		env: {},
		app: "vkma-deploy",
		...options,
	});
	return { output, reporter, ttyOut };
}

describe("StatusReporter", () => {
	it("writes every engage record fully (app resent, msg redacted)", () => {
		const { output, reporter } = ttyReporter({
			redact: text => text.replaceAll("s3cret", "***"),
		});
		reporter.working("Deploying s3cret");
		expect(output.join("")).toContain(`${prefix}state=working:app=vkma-deploy:msg=`);
		expect(output.join("")).not.toContain("s3cret");
	});

	it("is silent without a real terminal", () => {
		const output: string[] = [];
		const reporter = new StatusReporter({
			stdout: { write: text => output.push(text), isTTY: false },
			env: {},
		});
		reporter.working("Deploying");
		reporter.done("Deployed");
		expect(output.join("")).toBe("");
	});

	it("is silent without isTTY information at all", () => {
		const output: string[] = [];
		const reporter = new StatusReporter({
			stdout: { write: text => output.push(text) },
			env: {},
		});
		reporter.working("Deploying");
		expect(output.join("")).toBe("");
	});

	it("is silent in --json and with --no-status / VKMA_NO_STATUS", () => {
		for (const options of [
			{ json: true },
			{ disabled: true },
			{ env: { VKMA_NO_STATUS: "1" } },
		] as const) {
			const { output, reporter } = ttyReporter({ env: {}, ...options });
			reporter.working("Deploying");
			reporter.done("Deployed");
			expect(output.join("")).toBe("");
		}
	});

	it("dedupes identical working reports but re-sends on progress change", () => {
		const { output, reporter } = ttyReporter();
		reporter.working("Uploading", 0);
		reporter.working("Uploading", 0);
		reporter.working("Uploading", 46);
		const working = output
			.join("")
			.split(ESC_ST)
			.filter(part => part.includes("state=working"));
		expect(working).toHaveLength(2);
		expect(working[1]).toContain("progress=46");
	});

	it("blocked / resume hands the working record back", () => {
		const { output, reporter } = ttyReporter();
		reporter.working("Deploying app 42");
		reporter.blocked("question", "Deploy?");
		reporter.resume();
		const records = output.join("").split(ESC_ST);
		expect(records.some(part => part.includes("state=blocked:kind=question"))).toBe(true);
		const resumed = records.filter(part => part.includes("state=working"))[1] ?? "";
		const msgPair = resumed.split(":").find(pair => pair.startsWith("msg=")) ?? "";
		expect(Buffer.from(msgPair.slice(4), "base64").toString("utf8")).toBe("Deploying app 42");
		// The resume happened even though the msg/progress matched the last
		// working report: a prompt cycle must never leave a stale blocked.
		expect(records.filter(part => part.includes("state=working"))).toHaveLength(2);
	});

	it("resume() without prior working is a no-op (next report replaces)", () => {
		const { output, reporter } = ttyReporter();
		reporter.blocked("question", "Answer");
		reporter.resume();
		expect(output.join("").includes("state=working")).toBe(false);
	});

	it("done/error/idle stop resume() from resurrecting the working state", () => {
		const { output, reporter } = ttyReporter();
		reporter.working("Deploying");
		reporter.done("Deployed");
		reporter.resume();
		const working = output
			.join("")
			.split(ESC_ST)
			.filter(part => part.includes("state=working"));
		expect(working).toHaveLength(1);
	});

	it("failed() maps aborts to idle and the rest to error", () => {
		const canceled = ttyReporter();
		canceled.reporter.failed(
			new DeployError("aborted", "Deploy canceled", { code: "E_ABORTED" }),
		);
		expect(canceled.output.join("").includes("state=idle")).toBe(true);

		const errored = ttyReporter();
		errored.reporter.failed(new DeployError("api", "VK said no", { code: 15 }));
		const records = errored.output.join("").split(ESC_ST);
		expect(records.some(part => part.includes("state=error"))).toBe(true);
		const msgPair = (records.find(part => part.includes("state=error")) ?? "")
			.split(":")
			.find(pair => pair.startsWith("msg="));
		expect(Buffer.from((msgPair ?? "").slice(4), "base64").toString("utf8")).toBe("VK said no");

		const thrown = ttyReporter();
		thrown.reporter.failed("just a string");
		expect(thrown.output.join("").includes("state=error")).toBe(true);
	});
});
