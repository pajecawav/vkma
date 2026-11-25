import { describe, expect, test } from "vitest";
import { nextParamsText } from "./params-prefill.ts";

const STUB = { key: "", value: "" };
const STUB_TEXT = JSON.stringify(STUB, null, 2);
/** What a surface's Params field starts as (Execute's empty object). */
const PRISTINE = "{\n  \n}";

describe("nextParamsText", () => {
	test("an empty stub never overwrites untouched text", () => {
		expect(nextParamsText(PRISTINE, {}, undefined)).toBeUndefined();
		expect(nextParamsText(PRISTINE, undefined, undefined)).toBeUndefined();
	});

	test("an empty stub clears the auto-fill the surface wrote before", () => {
		// StorageSet (prefilled) followed by GetUserInfo (takes no params):
		// the previous event's params must not ride along with the send.
		expect(nextParamsText(STUB_TEXT, {}, STUB_TEXT, PRISTINE)).toBe(PRISTINE);
	});

	test("an empty stub still leaves the user's text alone", () => {
		const user = JSON.stringify({ key: "kept" }, null, 2);
		expect(nextParamsText(user, {}, STUB_TEXT, PRISTINE)).toBeUndefined();
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
