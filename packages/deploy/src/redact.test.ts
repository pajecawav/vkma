import { describe, expect, it } from "vitest";
import { createRedactor } from "./redact.ts";

describe("createRedactor", () => {
	it("redacts registered secrets in strings", () => {
		const redactor = createRedactor();
		redactor.add("super-secret-token");
		expect(redactor.redactString("Bearer super-secret-token")).toBe("Bearer ***");
	});

	it("redacts secrets in nested objects and arrays", () => {
		const redactor = createRedactor();
		redactor.add("tok_12345678");
		const out = redactor.redact({
			url: "https://x/?access_token=tok_12345678",
			nested: [{ token: "tok_12345678" }],
		});
		expect(out.url).toBe("https://x/?access_token=***");
		expect(out.nested[0]?.token).toBe("***");
	});

	it("masks access_token query params even when the value was not registered", () => {
		const redactor = createRedactor();
		expect(
			redactor.redactString("https://api.vk.ru/method/x?access_token=unknown&v=5.131"),
		).toBe("https://api.vk.ru/method/x?access_token=***&v=5.131");
	});

	it("ignores short or empty secrets", () => {
		const redactor = createRedactor();
		redactor.add("");
		redactor.add("short");
		expect(redactor.redactString("a short b")).toBe("a short b");
	});

	it("does not mutate the input object", () => {
		const redactor = createRedactor();
		redactor.add("secret-value");
		const input = { token: "secret-value" };
		const out = redactor.redact(input);
		expect(out.token).toBe("***");
		expect(input.token).toBe("secret-value");
	});

	it("keeps Date values as ISO strings instead of flattening them to {}", () => {
		const redactor = createRedactor();
		const out = redactor.redact({ issuedAt: new Date("2026-01-02T03:04:05.678Z") });
		expect(out.issuedAt).toBe("2026-01-02T03:04:05.678Z");
	});

	it("survives cyclic structures instead of overflowing the stack", () => {
		const redactor = createRedactor();
		const input: Record<string, unknown> = { token: "x" };
		input["self"] = input;
		const out = redactor.redact(input) as Record<string, unknown>;
		expect(out["self"]).toBe("[Circular]");
	});
});
