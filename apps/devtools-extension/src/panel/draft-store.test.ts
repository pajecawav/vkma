import { executeDraftKey, type ExecuteDraft } from "@vkma.dev/ui";
import { describe, expect, it, vi } from "vitest";
import { createDraftStore } from "./draft-store.ts";

/** This tab's entry; another tab has its own. */
const KEY = executeDraftKey(7);

type Listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => void;
type Storage = Pick<typeof chrome.storage, "session" | "onChanged">;

const RECORD: ExecuteDraft = { v: 1, target: "c-1", name: "VKWebAppInit", paramsText: "" };
const A: ExecuteDraft = { v: 1, target: "", name: "A", paramsText: "a" };
const AB: ExecuteDraft = { v: 1, target: "", name: "A", paramsText: "ab" };
const THEIRS: ExecuteDraft = { v: 1, target: "", name: "Theirs", paramsText: "{}" };

/** chrome.storage.session as far as this store cares: `get` is async and
 * may answer late, a `set` lands at once and is echoed to onChanged after
 * the write, in write order. The test decides when the echoes land. */
function fakeStorage(seed: Record<string, unknown> = {}) {
	const area = new Map<string, unknown>(Object.entries(seed));
	const listeners = new Set<Listener>();
	/** What storage holds: the browsers serialize, so undefined keys are gone. */
	const persisted = (value: unknown): unknown => JSON.parse(JSON.stringify(value));
	const notify = (key: string, oldValue: unknown, newValue: unknown, name = "session") => {
		for (const listener of listeners) {
			listener({ [key]: { oldValue, newValue } }, name);
		}
	};
	const echoes: Array<() => void> = [];
	const reads: Array<(value: Record<string, unknown>) => void> = [];
	const fake = {
		storage: {
			session: {
				get: (key: string) =>
					new Promise<Record<string, unknown>>(resolve => {
						if (fake.holdReads) {
							reads.push(resolve);
						} else {
							resolve({ [key]: area.get(key) });
						}
					}),
				set: (items: Record<string, unknown>) => {
					if (fake.failNextWrite) {
						fake.failNextWrite = false;
						return Promise.reject(new Error("QUOTA_BYTES quota exceeded"));
					}
					for (const [key, raw] of Object.entries(items)) {
						const oldValue = area.get(key);
						const value = persisted(raw);
						area.set(key, value);
						echoes.push(() => notify(key, oldValue, value));
					}
					return Promise.resolve();
				},
			},
			onChanged: {
				addListener: (listener: Listener) => {
					listeners.add(listener);
				},
				removeListener: (listener: Listener) => {
					listeners.delete(listener);
				},
			},
		} as unknown as Storage,
		holdReads: false,
		failNextWrite: false,
		/** Lets the oldest held read answer with what storage holds now. */
		answerRead: () => reads.shift()?.(Object.fromEntries(area)),
		/** A save by another surface: lands and is echoed at once. */
		writeElsewhere: (value: unknown, key = KEY, areaName = "session") => {
			const oldValue = area.get(key);
			const next = persisted(value);
			area.set(key, next);
			notify(key, oldValue, next, areaName);
		},
		/** Lets the oldest owed echo of this surface's writes land. */
		flushNext: () => echoes.shift()?.(),
		flushAll: () => {
			while (echoes.length > 0) {
				echoes.shift()?.();
			}
		},
		held: area,
	};
	return fake;
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

describe("createDraftStore", () => {
	it("reads the stored draft on start, undefined until it lands", async () => {
		const { storage } = fakeStorage({ [KEY]: RECORD });
		const store = createDraftStore(storage, KEY);
		expect(store.getDraft()).toBeUndefined();
		await flush();
		expect(store.getDraft()).toStrictEqual(RECORD);
	});

	it("no stored draft, or an unreadable one: the empty draft", async () => {
		const empty = { v: 1, target: "", name: "", paramsText: "{\n  \n}" };
		const missing = createDraftStore(fakeStorage().storage, KEY);
		const corrupt = createDraftStore(fakeStorage({ [KEY]: { v: 99 } }).storage, KEY);
		await flush();
		expect(missing.getDraft()).toStrictEqual(empty);
		expect(corrupt.getDraft()).toStrictEqual(empty);
	});

	it("a save is the draft at once, then lands in storage under its own key", async () => {
		const fake = fakeStorage();
		const store = createDraftStore(fake.storage, KEY);
		store.save({ ...RECORD, targetUrl: undefined });
		expect(store.getDraft()).toStrictEqual(RECORD);
		await flush();
		expect(fake.held.get(KEY)).toStrictEqual(RECORD);
		expect([...fake.held.keys()]).toStrictEqual([KEY]);
	});

	it("the read never overwrites a save made before it answered", async () => {
		const fake = fakeStorage({ [KEY]: THEIRS });
		fake.holdReads = true;
		const store = createDraftStore(fake.storage, KEY);
		store.save(RECORD);
		fake.answerRead();
		await flush();
		expect(store.getDraft()).toStrictEqual(RECORD);
	});

	it("a change that raced ahead of the read is the newer fact", async () => {
		const fake = fakeStorage({ [KEY]: THEIRS });
		fake.holdReads = true;
		const store = createDraftStore(fake.storage, KEY);
		const unsubscribe = store.subscribe(() => {});
		fake.writeElsewhere(RECORD);
		fake.answerRead();
		await flush();
		expect(store.getDraft()).toStrictEqual(RECORD);
		unsubscribe();
	});

	it("its own echo settles silently", async () => {
		const fake = fakeStorage();
		const store = createDraftStore(fake.storage, KEY);
		const listener = vi.fn();
		store.subscribe(listener);
		await flush();
		listener.mockClear();

		store.save(A);
		expect(listener).toHaveBeenCalledTimes(1);
		fake.flushAll();
		expect(listener).toHaveBeenCalledTimes(1);
		expect(store.getDraft()).toStrictEqual(A);
	});

	it("a stale echo of an earlier save never rolls the draft back", async () => {
		// "a" was written, then "ab" was typed before "a"'s echo arrived
		const fake = fakeStorage();
		const store = createDraftStore(fake.storage, KEY);
		const listener = vi.fn();
		store.subscribe(listener);
		store.save(A);
		store.save(AB);
		expect(listener).toHaveBeenCalledTimes(2);

		fake.flushNext();
		expect(listener).toHaveBeenCalledTimes(2);
		expect(store.getDraft()).toStrictEqual(AB);
		fake.flushNext();
		expect(listener).toHaveBeenCalledTimes(2);
		expect(store.getDraft()).toStrictEqual(AB);
	});

	it("the other surface of this tab (the side panel) is adopted and notified", async () => {
		const fake = fakeStorage();
		const store = createDraftStore(fake.storage, KEY);
		const listener = vi.fn();
		store.subscribe(listener);
		await flush();
		listener.mockClear();

		fake.writeElsewhere(THEIRS);
		expect(store.getDraft()).toStrictEqual(THEIRS);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("a write that failed is no longer owed: the same save from elsewhere is adopted", async () => {
		const fake = fakeStorage();
		fake.failNextWrite = true;
		const store = createDraftStore(fake.storage, KEY);
		const listener = vi.fn();
		store.subscribe(listener);
		store.save(A);
		await flush();
		listener.mockClear();

		fake.writeElsewhere(A);
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it("another tab's draft, other keys and other areas are not this draft", async () => {
		const fake = fakeStorage();
		const store = createDraftStore(fake.storage, KEY);
		const listener = vi.fn();
		store.subscribe(listener);
		await flush();
		listener.mockClear();

		fake.writeElsewhere(THEIRS, executeDraftKey(8));
		fake.writeElsewhere(THEIRS, "vkma:theme");
		fake.writeElsewhere(THEIRS, KEY, "local");
		expect(listener).not.toHaveBeenCalled();
		expect(store.getDraft()?.name).toBe("");
	});

	it("unsubscribed, a change is no longer delivered", async () => {
		const fake = fakeStorage();
		const store = createDraftStore(fake.storage, KEY);
		const listener = vi.fn();
		const unsubscribe = store.subscribe(listener);
		await flush();
		unsubscribe();
		listener.mockClear();

		fake.writeElsewhere(THEIRS);
		expect(listener).not.toHaveBeenCalled();
	});
});
