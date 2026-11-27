import { executeDraftKey, type ExecuteDraft } from "@vkma.dev/ui";
import { useState, useSyncExternalStore } from "react";
import { api } from "../shared/api.ts";
import { createDraftStore } from "./draft-store.ts";

/**
 * The Execute form's draft, persisted so the typed event and params
 * survive the reload of the page the FAB iframe lives in (and the panel
 * tab or the side panel being reopened). One draft per tab: the tabs of
 * different mini apps must not hand each other their params. Without a
 * tab id (the panel that watches every tab at once) the draft is the
 * surface's own.
 *
 * chrome.storage.session, the in-memory jar that dies with the browser
 * session: a tab id means nothing after a restart, so a per-tab draft on
 * disk would only leave orphans behind. The tab's FAB iframe and its side
 * panel read the same entry: a save in one reaches the other live.
 *
 * The draft is `undefined` until storage has answered: Execute then runs
 * on its own empty state and adopts the stored draft when it lands.
 */
export function useExecuteDraft(tabId?: number): {
	draft: ExecuteDraft | undefined;
	save: (next: ExecuteDraft) => void;
} {
	// One store per panel page: useState only gives it a lazy, stable
	// identity.
	const [store] = useState(() => createDraftStore(api.storage, executeDraftKey(tabId)));
	const draft = useSyncExternalStore(store.subscribe, store.getDraft);
	return { draft, save: store.save };
}
