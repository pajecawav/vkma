import { describe, expect, test } from "vitest";
import { nextParamsText } from "./params-prefill.ts";

const STUB = { key: "", value: "" };
const STUB_TEXT = JSON.stringify(STUB, null, 2);

describe("nextParamsText", () => {
	test("an empty stub never overwrites", () => {
		expect(nextParamsText("{\n  \n}", {}, undefined)).toBeUndefined();
		expect(nextParamsText("{\n  \n}", undefined, undefined)).toBeUndefined();
	});

	test("the pristine default and empty strings are replaceable", () => {
		expect(nextParamsText("{\n  \n}", STUB, undefined)).toBe(STUB_TEXT);
		expect(nextParamsText("", STUB, undefined)).toBe(STUB_TEXT);
		expect(nextParamsText("   ", STUB, undefined)).toBe(STUB_TEXT);
	});

	test("an empty JSON object carries nothing worth keeping", () => {
		expect(nextParamsText("{}", STUB, undefined)).toBe(STUB_TEXT);
	});

	test("user-typed JSON wins over the stub", () => {
		const user = JSON.stringify({ key: "kept" }, null, 2);
		expect(nextParamsText(user, STUB, undefined)).toBeUndefined();
	});

	test("broken JSON wins over the stub", () => {
		expect(nextParamsText("{key:", STUB, undefined)).toBeUndefined();
	});

	test("a previous auto-fill may be replaced by the next stub", () => {
		const other = JSON.stringify({ method: "" }, null, 2);
		expect(nextParamsText(STUB_TEXT, { method: "" }, STUB_TEXT)).toBe(other);
		// …but only while it is still exactly the auto-fill text.
		expect(nextParamsText(`${STUB_TEXT} `, { method: "" }, STUB_TEXT)).toBeUndefined();
	});
});
