/**
 * PROTOTYPE (spike 1) — lift-able pure module.
 *
 * Mirror of the browser history stack in terms of VKUI panel ids, indexed by
 * TanStack's `__TSR_index` (the absolute position in the history stack).
 * Replaces the old router's ViewHistory key-matching with direct indexing.
 */

export interface PanelsStackState {
	/** panel id per history index (null = unknown entry, e.g. before init) */
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
	// Manual URL edit or foreign entry: cannot know the real index — treat as
	// a push right after the current position (old router's interpretation).
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
	const entries = [...prev.entries];
	const filled: Array<string | null> = [];
	for (let i = 0; i <= at; i++) {
		filled[i] = entries[i] ?? null;
	}
	if (filled[at] === null) {
		filled[at] = panel;
	}
	return { entries: filled, cursor: at };
}

/** VKUI `View.history` prop: panels in open order, overlays excluded (spike 1 has none). */
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
