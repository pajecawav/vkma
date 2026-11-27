import { EMPTY_EXECUTE_DRAFT } from "@vkma.dev/ui";
import { describe, expect, test } from "vitest";
import { readExecuteDraft, writeExecuteDraft } from "./execute-draft.ts";

const KEY = "vkma:execute-draft";

function fakeJar(initial: Record<string, string> = {}) {
	const entries = new Map(Object.entries(initial));
	return {
		getItem: (key: string) => entries.get(key) ?? null,
		setItem: (key: string, value: string) => {
			entries.set(key, value);
		},
		entries,
	};
}

const sealed = () => ({
	getItem: () => {
		throw new DOMException("Storage is disabled", "SecurityError");
	},
	setItem: () => {
		throw new DOMException("Storage is disabled", "SecurityError");
	},
});

const empty = () => ({ ...EMPTY_EXECUTE_DRAFT });

describe("the dev-server panel's Execute draft", () => {
	test("nothing stored: the empty draft", () => {
		expect(readExecuteDraft(fakeJar())).toStrictEqual(empty());
	});

	test("reads what the page load before wrote", () => {
		const stored = { v: 1, target: "c-1", name: "VKWebAppInit", paramsText: '{\n  "a": 1\n}' };
		expect(readExecuteDraft(fakeJar({ [KEY]: JSON.stringify(stored) }))).toStrictEqual(stored);
	});

	test("a write hands back the draft the form shows and stores it", () => {
		const jar = fakeJar();
		const written = writeExecuteDraft(jar, {
			v: 1,
			target: "c-1",
			targetUrl: undefined,
			name: "VKWebAppGetUserInfo",
			paramsText: '{"user_id": 7}',
			lastAutoFill: undefined,
		});
		expect(written).toStrictEqual({
			v: 1,
			target: "c-1",
			name: "VKWebAppGetUserInfo",
			paramsText: '{"user_id": 7}',
		});
		// undefined keys never reach the jar
		expect(Object.keys(JSON.parse(jar.entries.get(KEY) ?? "null"))).toStrictEqual([
			"v",
			"target",
			"name",
			"paramsText",
		]);
		expect(readExecuteDraft(jar)).toStrictEqual(written);
	});

	test("a corrupt record, or one from another version, degrades to the empty draft", () => {
		expect(readExecuteDraft(fakeJar({ [KEY]: "{not json" }))).toStrictEqual(empty());
		expect(readExecuteDraft(fakeJar({ [KEY]: '{"v":2,"name":"A"}' }))).toStrictEqual(empty());
	});

	test("a sealed jar, or none at all: reads are empty and the form still gets its draft", () => {
		expect(readExecuteDraft(sealed())).toStrictEqual(empty());
		expect(readExecuteDraft(undefined)).toStrictEqual(empty());
		const next = { ...empty(), name: "VKWebAppInit" };
		expect(writeExecuteDraft(sealed(), next)).toStrictEqual(next);
		expect(writeExecuteDraft(undefined, next)).toStrictEqual(next);
	});
});
