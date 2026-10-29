/**
 * Mirror of the browser history stack in terms of VKUI panel ids, indexed
 * by `location.state.__TSR_index` (the absolute position in the history
 * stack). Replaces the old router's key-matching ViewHistory with direct
 * indexing. Pure — the React binding gates writes on the router's
 * `status === "idle"` (the location commit lands a render before match
 * resolution, so a naive write records the stale panel at the new index).
 */

export interface PanelsStackState {
	/** panel id per history index (null = unknown entry) */
	entries: Array<string | null>;
	/** current history index */
	cursor: number;
}

export const initialPanelsStack = (): PanelsStackState => ({
	entries: [],
	cursor: -1,
});

/**
 * @param index `location.state.__TSR_index`, or null when the history entry
 *              carries no TanStack state (manual hash edit / foreign entry).
 */
export function applyLocation(
	prev: PanelsStackState,
	index: number | null,
	panel: string,
): PanelsStackState {
	const at = index ?? prev.cursor + 1;

	if (prev.cursor === -1) {
		// init (cold start / reload / deep link): anchor at the real history
		// index — `__TSR_index` survives reloads in history.state. Earlier
		// slots are unknown (null) and skipped by panelsHistoryOf.
		const filled: Array<string | null> = [];
		for (let i = 0; i <= at; i++) {
			filled[i] = i === at ? panel : null;
		}
		return { entries: filled, cursor: at };
	}

	if (at > prev.cursor) {
		// push: truncate the forward branch, then place the panel at `at`
		const truncated = prev.entries.slice(0, prev.cursor + 1);
		const filled: Array<string | null> = [];
		for (let i = 0; i <= at; i++) {
			filled[i] = i === at ? panel : (truncated[i] ?? null);
		}
		return { entries: filled, cursor: at };
	}

	if (at === prev.cursor) {
		// replace (same slot, new location)
		const entries = [...prev.entries];
		entries[at] = panel;
		return { entries, cursor: at };
	}

	// pop (back/forward into a known or unknown earlier slot)
	const filled: Array<string | null> = [];
	for (let i = 0; i <= at; i++) {
		filled[i] = prev.entries[i] ?? null;
	}
	if (filled[at] === null) {
		filled[at] = panel;
	}
	return { entries: filled, cursor: at };
}

/**
 * VKUI `View.history` prop: panels in open order. Overlay entries never
 * reach this stack (they live in history.state, not as panels).
 */
export function panelsHistoryOf(state: PanelsStackState): string[] {
	const out: string[] = [];
	for (let i = 0; i <= state.cursor; i++) {
		const panel = state.entries[i];
		if (panel) {
			out.push(panel);
		}
	}
	return out;
}
