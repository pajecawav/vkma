import { type ExecuteDraft, parseExecuteDraft, settleOwnWrite } from "@vkma.dev/ui";

/** The owed-saves ledger's ceiling. Both browsers echo a surface's own
 * writes within milliseconds; a surface that somehow never sees them must
 * not park every keystroke of a panel left open for days. */
const OWED_LIMIT = 128;

export interface DraftStore {
	/** The stored draft: `undefined` until storage has answered. */
	getDraft: () => ExecuteDraft | undefined;
	/** Makes `next` the draft at once and writes it out. */
	save: (next: ExecuteDraft) => void;
	/** Notified on every change of the draft; returns the unsubscribe. */
	subscribe: (listener: () => void) => () => void;
}

/**
 * chrome.storage.session as one tab's Execute draft: the read on start,
 * the writes, and the ledger that tells this surface's own echoes from
 * the other surface's saves (the tab's FAB iframe and its side panel
 * share the entry). No React here, so it is tested against a fake
 * storage; `useExecuteDraft` binds it to a panel.
 */
export function createDraftStore(
	storage: Pick<typeof chrome.storage, "session" | "onChanged">,
	key: string,
): DraftStore {
	let draft: ExecuteDraft | undefined;
	/** False until the first value landed, from the read or from a
	 * change: a change that raced ahead of the read is the newer fact. */
	let loaded = false;
	/** This surface's saves whose onChanged echo has not arrived yet,
	 * oldest first. */
	const owed: ExecuteDraft[] = [];
	const listeners = new Set<() => void>();

	const emit = (): void => {
		for (const listener of listeners) {
			listener();
		}
	};

	const onChanged = (
		changes: Record<string, chrome.storage.StorageChange>,
		area: string,
	): void => {
		if (area !== "session" || changes[key] === undefined) {
			return;
		}
		const next = parseExecuteDraft(changes[key].newValue);
		// This surface's own echo: the state already holds it, and an
		// earlier save's echo may even be behind the state.
		if (settleOwnWrite(owed, next)) {
			return;
		}
		loaded = true;
		draft = next;
		emit();
	};

	void storage.session.get(key).then(stored => {
		if (loaded) {
			return;
		}
		loaded = true;
		draft = parseExecuteDraft(stored[key]);
		emit();
	});

	return {
		getDraft: () => draft,
		save(next) {
			const record = parseExecuteDraft(next);
			// State first: the write is fire-and-forget, and its echo is
			// settled above rather than adopted.
			loaded = true;
			draft = record;
			owed.push(record);
			if (owed.length > OWED_LIMIT) {
				owed.shift();
			}
			emit();
			void storage.session.set({ [key]: record }).catch(() => {
				const index = owed.indexOf(record);
				if (index !== -1) {
					owed.splice(index, 1);
				}
			});
		},
		subscribe(listener) {
			listeners.add(listener);
			storage.onChanged.addListener(onChanged);
			return () => {
				listeners.delete(listener);
				storage.onChanged.removeListener(onChanged);
			};
		},
	};
}
