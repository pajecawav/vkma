/**
 * Modal choreography state machine, pure, React-free; the `<Modals>` host
 * in `modals.tsx` drives it and completes exits from the surface's
 * `onClosed`. One step per reconcile: every close is an animated exit whose
 * completion triggers the next step.
 *
 * EVERY retarget closes the displayed sheet first and opens the target only
 * after the exit completes: sibling, nested and back-to-parent transitions
 * all share this path. At most one entry is open at any moment; route
 * nesting still controls history, not simultaneous presentation.
 *
 * While an exit is in flight:
 * - retargeting BACK to the exiting sheet CANCELS the exit. VKUI reverses
 *   the transition mid-flight (`open` flips back to `true`), so there is no
 *   close-then-reopen bounce;
 * - any OTHER target is QUEUED: the state's `target` carries the LATEST
 *   router request and the exit's completion re-reconciles toward it.
 *   Dropping it would leave the host showing a modal the router no longer
 *   matches, desynced until the next navigation.
 */

interface ChoreographyEntry {
	/** Modal id, also the VKUI `nav`. */
	id: string;
	/** Full route id of the modal route. */
	routeId: string;
}

export interface ChoreographyState<T extends ChoreographyEntry> {
	/** the modal route that should be open on top right now */
	target: T | null;
	/** the open entry, as a zero-or-one-item list */
	stack: T[];
	/** the entry animating out (mounted with open=false) */
	exiting: T | null;
	/** the exiting id whose `onClosed` completes the transition */
	awaitingExitId: string | null;
}

export const idleChoreography = <T extends ChoreographyEntry>(): ChoreographyState<T> => ({
	target: null,
	stack: [],
	exiting: null,
	awaitingExitId: null,
});

export function reconcile<T extends ChoreographyEntry>(
	previous: ChoreographyState<T>,
	target: T | null,
): ChoreographyState<T> {
	if (previous.awaitingExitId !== null) {
		const exiting = previous.exiting;
		if (exiting !== null && target?.id === exiting.id) {
			// retargeting the exiting sheet: CANCEL the exit and restore it
			return {
				...previous,
				target,
				stack: [...previous.stack, exiting],
				exiting: null,
				awaitingExitId: null,
			};
		}
		// any other target mid-exit: queue it. The exit's completion
		// (handleClosed) re-reconciles toward this latest request
		return { ...previous, target };
	}
	const top = previous.stack[previous.stack.length - 1] ?? null;
	if (top === null) {
		return target === null
			? { ...previous, target: null }
			: { ...previous, target, stack: [target] };
	}
	if (target !== null && target.id === top.id) {
		return { ...previous, target }; // already on top, settle
	}
	// Any different modal (including a nested child or parent) or
	// close-everything: close the open sheet first. The target opens when
	// the exit completes.
	return {
		...previous,
		target,
		stack: previous.stack.slice(0, -1),
		exiting: top,
		awaitingExitId: top.id,
	};
}
