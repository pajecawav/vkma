/**
 * Modal choreography state machine, pure, React-free; the `<Modals>` host
 * in `modals.tsx` drives it and completes exits from the surface's
 * `onClosed`. One step per reconcile: every close is an animated exit whose
 * completion triggers the next step. Route ids are hierarchical
 * (`/view:feed/post/$id/comments`), so the nested/sibling relation is a
 * string prefix check.
 *
 * - a SIBLING retarget (comments → share) closes the displayed sheet first
 *   and opens the new one only after the exit completes, never two sibling
 *   sheets at once (the user-reported bug from the first spike);
 * - a NESTED open (the target is a child route of the displayed modal)
 *   keeps the displayed sheet open and stacks the child ON TOP of it, two
 *   open sheets by design; back unwinds the stack one level per entry;
 * - back to the parent modal closes the top and reveals the parent.
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
	/** open entries, bottom → top (nested modals stack) */
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
	if (target !== null && target.routeId.startsWith(`${top.routeId}/`)) {
		// NESTED open: the target is a child route of the displayed modal.
		// Keep it open and stack the child on top
		return { ...previous, target, stack: [...previous.stack, target] };
	}
	if (target !== null && top.routeId.startsWith(`${target.routeId}/`)) {
		// back to an ANCESTOR modal: close the top, the parent stays open
		return {
			...previous,
			target,
			stack: previous.stack.slice(0, -1),
			exiting: top,
			awaitingExitId: top.id,
		};
	}
	// sibling/unrelated modal or close-everything: close the top first.
	// The target opens when the exit completes
	return {
		...previous,
		target,
		stack: previous.stack.slice(0, -1),
		exiting: top,
		awaitingExitId: top.id,
	};
}
