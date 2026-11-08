import { describe, expect, it } from "vitest";
import { statusSequence, STATUS_LIMITS, type StatusRecord } from "./index.ts";

const ESC_ST = "\x1b\\";
const prefix = "\x1b]7501;";

function decode(base64: string): string {
	return Buffer.from(base64, "base64").toString("utf8");
}

describe("statusSequence()", () => {
	it("builds the full sequence with base64-encoded msg", () => {
		const sequence = statusSequence({ state: "working", app: "vkma-deploy", msg: "Deploying" });
		const body = sequence.slice(prefix.length, -ESC_ST.length);
		const pairs = Object.fromEntries(
			body.split(":").map(pair => {
				const [key, value] = pair.split("=");
				return [key, value];
			}),
		);
		expect(sequence.startsWith(prefix)).toBe(true);
		expect(sequence.endsWith(ESC_ST)).toBe(true);
		expect(pairs["state"]).toBe("working");
		expect(pairs["app"]).toBe("vkma-deploy");
		expect(decode(pairs["msg"] as string)).toBe("Deploying");
	});

	it("clears the root record with no extra pairs", () => {
		expect(statusSequence({ state: "clear" })).toBe(`${prefix}state=clear${ESC_ST}`);
	});

	it("clears a child record by id", () => {
		expect(statusSequence({ state: "clear", id: "upload" })).toBe(
			`${prefix}state=clear:id=upload${ESC_ST}`,
		);
	});

	it("accepts an eight-level id and refuses nine", () => {
		expect(statusSequence({ state: "clear", id: "a/b/c/d/e/f/g/h" })).toBe(
			`${prefix}state=clear:id=a/b/c/d/e/f/g/h${ESC_ST}`,
		);
		expect(statusSequence({ state: "clear", id: "a/b/c/d/e/f/g/h/i" })).toBe("");
	});

	it("carries kind and progress only on their legal states", () => {
		const blocked = statusSequence({
			state: "blocked",
			kind: "question",
			progress: 40,
			msg: "Enter the code",
		});
		expect(blocked).toContain("kind=question");
		expect(blocked).toContain("progress=40");

		// kind/progress are ignored everywhere else (spec: treated as absent).
		expect(statusSequence({ state: "done", kind: "question", progress: 1 })).not.toContain(
			"kind=question",
		);
		expect(statusSequence({ state: "done", kind: "question", progress: 1 })).not.toContain(
			"progress=1",
		);
	});

	it("drops out-of-range progress values instead of sending them", () => {
		for (const progress of [-1, 101, 4.2]) {
			expect(
				statusSequence({ state: "working", progress } satisfies StatusRecord).includes(
					"progress=",
				),
			).toBe(false);
		}
	});

	it("sanitizes control characters out of free text", () => {
		const sequence = statusSequence({ state: "working", msg: "line1\nline2\tend\u0007!" });
		const body = sequence.slice(prefix.length, -ESC_ST.length);
		const msg =
			body
				.split(":")
				.find(pair => pair.startsWith("msg="))
				?.slice(4) ?? "";
		expect(decode(msg)).toBe("line1 line2 end !");
	});

	it("keeps multibyte text intact through base64", () => {
		const sequence = statusSequence({ state: "done", msg: "Deployed встреча 🌊" });
		const body = sequence.slice(prefix.length, -ESC_ST.length);
		const msgPair = body.split(":").find(pair => pair.startsWith("msg=")) ?? "";
		expect(decode(msgPair.slice(4))).toBe("Deployed встреча 🌊");
	});

	it("truncates oversized msg to the encoded cap", () => {
		const sequence = statusSequence({ state: "working", msg: "x".repeat(20_000) });
		const msgPair = sequence
			.slice(prefix.length, -ESC_ST.length)
			.split(":")
			.find(pair => pair.startsWith("msg="));
		expect(msgPair !== undefined).toBe(true);
		expect((msgPair?.length ?? 0) - 4).toBeLessThanOrEqual(STATUS_LIMITS.msgEncoded);
		expect(decode(msgPair?.slice(4) ?? "").startsWith("xxx")).toBe(true);
		// And the whole report stays inside the sequence cap.
		expect(sequence.length).toBeLessThanOrEqual(STATUS_LIMITS.report);
	});

	it("truncates oversized title to its tighter cap", () => {
		const sequence = statusSequence({ state: "working", title: "y".repeat(3000) });
		const titlePair = sequence
			.slice(prefix.length, -ESC_ST.length)
			.split(":")
			.find(pair => pair.startsWith("title="));
		expect((titlePair?.length ?? 0) - 6).toBeLessThanOrEqual(STATUS_LIMITS.titleEncoded);
	});

	it("never exceeds the whole-sequence cap even with every field maxed", () => {
		const sequence = statusSequence({
			state: "blocked",
			kind: "permission",
			id: "a".repeat(STATUS_LIMITS.idSegment),
			app: "b".repeat(STATUS_LIMITS.app),
			title: "T".repeat(20_000),
			msg: "z".repeat(20_000),
		});
		expect(sequence).not.toBe("");
		expect(sequence.length).toBeLessThanOrEqual(STATUS_LIMITS.report);
	});

	it("refuses records unusable by any terminal", () => {
		// id: wrong characters, an empty segment, depth, and total size caps.
		expect(statusSequence({ state: "working", id: "bad id" })).toBe("");
		expect(statusSequence({ state: "working", id: "a//b" })).toBe("");
		expect(statusSequence({ state: "working", id: "1/2/3/4/5/6/7/8/9" })).toBe("");
		expect(statusSequence({ state: "working", id: "a".repeat(33) })).toBe("");
		expect(statusSequence({ state: "working", id: `${"a".repeat(32)}/`.repeat(8) })).toBe("");
		// app: wrong characters.
		expect(statusSequence({ state: "working", app: "not allowed;" })).toBe("");
	});
});
