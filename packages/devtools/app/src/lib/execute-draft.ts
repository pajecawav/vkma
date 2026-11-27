import {
	EMPTY_EXECUTE_DRAFT,
	EXECUTE_DRAFT_STORAGE_KEY,
	type ExecuteDraft,
	parseExecuteDraft,
} from "@vkma.dev/ui";
import { useCallback, useState } from "react";

/** The slice of web storage the draft needs. */
interface DraftJar {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** The tab's sessionStorage, or undefined when the browser keeps it from
 * this page (a blocked storage throws on access). */
function tabJar(): DraftJar | undefined {
	try {
		return sessionStorage;
	} catch {
		return undefined;
	}
}

/**
 * The dev-server panel's Execute draft. sessionStorage is one jar per TAB
 * and origin, which is exactly the draft's scope: the FAB iframe dies
 * with the mini app page on a reload and reads the same jar back (same
 * tab, same origin as the app), while a second tab of the app, or the
 * standalone /__vkma/ tab, keeps a draft of its own. Nothing outlives
 * the tab, so no draft is left behind.
 *
 * Synchronous, like every other preference of this panel: the form opens
 * already filled.
 */
export function useExecuteDraft(): {
	draft: ExecuteDraft;
	save: (next: ExecuteDraft) => void;
} {
	const [draft, setDraft] = useState<ExecuteDraft>(() => readExecuteDraft(tabJar()));
	const save = useCallback((next: ExecuteDraft) => {
		setDraft(writeExecuteDraft(tabJar(), next));
	}, []);
	return { draft, save };
}

/** The stored draft; the empty one when there is none or the jar is sealed. */
export function readExecuteDraft(jar: DraftJar | undefined): ExecuteDraft {
	if (jar === undefined) {
		return { ...EMPTY_EXECUTE_DRAFT };
	}
	try {
		return parseExecuteDraft(jar.getItem(EXECUTE_DRAFT_STORAGE_KEY));
	} catch {
		return { ...EMPTY_EXECUTE_DRAFT };
	}
}

/** `next` normalized for the form, persisted when the jar takes it. */
export function writeExecuteDraft(jar: DraftJar | undefined, next: ExecuteDraft): ExecuteDraft {
	const record = parseExecuteDraft(next);
	if (jar !== undefined) {
		try {
			jar.setItem(EXECUTE_DRAFT_STORAGE_KEY, JSON.stringify(record));
		} catch {
			// A sealed or full jar: the form keeps working, it just does
			// not survive the reload.
		}
	}
	return record;
}
