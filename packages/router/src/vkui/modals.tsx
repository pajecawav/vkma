import { useRouterState } from "@tanstack/react-router";
import { ModalCard, ModalPage, type ModalCardProps, type ModalPageProps } from "@vkontakte/vkui";
import {
	type ComponentType,
	createContext,
	type LazyExoticComponent,
	Suspense,
	useContext,
	useEffect,
	useState,
} from "react";

/**
 * Modal choreography. A modal is a child route of a panel (or of another
 * modal); the host keeps exactly the matched chain open:
 *
 * - a SIBLING retarget (comments → share) closes the displayed sheet first
 *   and opens the new one only after the exit completes — never two sibling
 *   sheets at once (the user-reported bug from the first spike);
 * - a NESTED open (the target is a child route of the displayed modal)
 *   keeps the displayed sheet open and stacks the child ON TOP of it — two
 *   open sheets by design; back unwinds the stack one level per entry;
 * - back to the parent modal closes the top and reveals the parent.
 *
 * Exit completion is EVENT-DRIVEN: VKUI fires `onClosed` at the transition
 * end and backs it with an internal timer computed from the element's real
 * `transitionDuration` (adapts to platform/theme/reduced-motion — more
 * accurate than any host-side constant). The host `exitDuration` is only a
 * WATCHDOG for the one case VKUI cannot report: the modal unmounting before
 * the exit finishes (its entry vanished from `entries`). Re-targeting the
 * displayed modal while it is exiting CANCELS the exit — VKUI reverses the
 * transition mid-flight, so there is no close-then-reopen bounce.
 */

/** A renderable modal entry component — plain or React.lazy. */
export type ModalEntryComponent = ComponentType | LazyExoticComponent<ComponentType>;

export interface ModalEntry {
	/** Full route id of the modal route (e.g. `/item/$id/details`). */
	routeId: string;
	/** Modal id — also the VKUI `nav`. */
	id: string;
	/**
	 * The modal content. Its root must be a ModalPageSurface or
	 * ModalCardSurface — the host binds nav/open/close choreography to it
	 * through context; the component owns every other prop at runtime.
	 */
	Component: ModalEntryComponent;
}

export interface ModalsProps {
	entries: ModalEntry[];
	/**
	 * Watchdog bound for an exit whose `onClosed` never arrives (the modal
	 * unmounted mid-animation), ms. Default 420 — well past any VKUI modal
	 * exit animation; a healthy `onClosed` lands long before it fires.
	 */
	exitDuration?: number;
}

/** Host-bound surface controls, provided to every mounted modal entry. */
interface ModalSurfaceApi {
	nav: string;
	open: boolean;
	/** Another modal is stacked on top of this one — suppress the focus trap. */
	stacked: boolean;
	onClose: () => void;
	onClosed: () => void;
}

const ModalSurfaceContext = createContext<ModalSurfaceApi | null>(null);

function useModalSurface(): ModalSurfaceApi {
	const api = useContext(ModalSurfaceContext);
	if (api === null) {
		throw new Error(
			"[vkma-router] ModalPageSurface/ModalCardSurface must be the root of a modal entry rendered by <Modals>",
		);
	}
	return api;
}

/** ModalPage surface for a modal entry — the host owns nav/open/close choreography. */
export function ModalPageSurface({
	children,
	...surface
}: Omit<ModalPageProps, "nav" | "open" | "onClose" | "onClosed" | "keepMounted">) {
	const api = useModalSurface();
	return (
		<ModalPage {...api} keepMounted disableFocusTrap={api.stacked || undefined} {...surface}>
			{children}
		</ModalPage>
	);
}

/**
 * ModalCard surface for a modal entry — same contract as
 * ModalPageSurface, with the card's icon/title/description/actions as
 * ordinary runtime props.
 */
export function ModalCardSurface({
	children,
	...surface
}: Omit<ModalCardProps, "nav" | "open" | "onClose" | "onClosed" | "keepMounted">) {
	const api = useModalSurface();
	return (
		<ModalCard {...api} keepMounted disableFocusTrap={api.stacked || undefined} {...surface}>
			{children}
		</ModalCard>
	);
}

interface ChoreographyState {
	/** the modal route that should be open on top right now */
	target: ModalEntry | null;
	/** open entries, bottom → top (nested modals stack) */
	stack: ModalEntry[];
	/** the entry animating out (mounted with open=false) */
	exiting: ModalEntry | null;
	/** the exiting id whose `onClosed` completes the transition */
	awaitingExitId: string | null;
}

const IDLE: ChoreographyState = {
	target: null,
	stack: [],
	exiting: null,
	awaitingExitId: null,
};

/**
 * Reconcile the open stack against the matched modal. One step per call:
 * every close is an animated exit whose `onClosed` triggers the next step.
 * Route ids are hierarchical (`/view:feed/post/$id/comments`), so the
 * nested/sibling relation is a string prefix check.
 */
function reconcile(previous: ChoreographyState, target: ModalEntry | null): ChoreographyState {
	if (previous.awaitingExitId !== null) {
		return previous; // mid-exit — the exit's completion re-reconciles
	}
	const top = previous.stack[previous.stack.length - 1] ?? null;
	if (top === null) {
		return target === null
			? { ...previous, target: null }
			: { ...previous, target, stack: [target] };
	}
	if (target !== null && target.id === top.id) {
		return { ...previous, target }; // already on top — settle
	}
	if (target !== null && target.routeId.startsWith(`${top.routeId}/`)) {
		// NESTED open: the target is a child route of the displayed modal —
		// keep it open and stack the child on top
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
	// sibling/unrelated modal or close-everything: close the top first —
	// the target opens when the exit completes
	return {
		...previous,
		target,
		stack: previous.stack.slice(0, -1),
		exiting: top,
		awaitingExitId: top.id,
	};
}

export function Modals({ entries, exitDuration = 420 }: ModalsProps) {
	const routeIds = new Set(entries.map(entry => entry.routeId));
	const matchedModalEntry = useRouterState({
		select: state => {
			for (let i = state.matches.length - 1; i >= 0; i--) {
				const routeId = state.matches[i]?.routeId;
				if (routeId !== undefined && routeIds.has(routeId)) {
					return entries.find(entry => entry.routeId === routeId) ?? null;
				}
			}
			return null;
		},
	});
	const globalModalId = useRouterState({
		select: state => (state.location.search as { modal?: string } | undefined)?.modal ?? null,
	});
	const globalEntry =
		globalModalId !== null ? (entries.find(entry => entry.id === globalModalId) ?? null) : null;
	const target = matchedModalEntry ?? globalEntry;

	const [state, setState] = useState<ChoreographyState>(() => reconcile(IDLE, target));

	// choreograph target changes (see reconcile)
	useEffect(() => {
		setState(previous => reconcile(previous, target));
	}, [target]);

	const handleClosed = (closedId: string): void => {
		setState(previous => {
			if (previous.awaitingExitId !== closedId) {
				return previous; // stale or unexpected callback
			}
			const settled: ChoreographyState = {
				...previous,
				exiting: null,
				awaitingExitId: null,
			};
			return reconcile(settled, settled.target);
		});
	};

	// watchdog for the lost-onClosed case (unmount mid-exit); the dep set
	// re-arms it on every new exit and cleans up on completion/unmount
	useEffect(() => {
		if (state.awaitingExitId === null) {
			return;
		}
		const watchdog = setTimeout(
			() => handleClosed(state.awaitingExitId as string),
			exitDuration * 2,
		);
		return () => clearTimeout(watchdog);
	}, [state.awaitingExitId, exitDuration]);

	// render the open stack (bottom → top) plus the exiting sheet
	const rendered: Array<{ entry: ModalEntry; open: boolean; stacked: boolean }> = [];
	state.stack.forEach((entry, index) => {
		rendered.push({ entry, open: true, stacked: index < state.stack.length - 1 });
	});
	if (state.exiting !== null && !state.stack.some(entry => entry.id === state.exiting?.id)) {
		rendered.push({ entry: state.exiting, open: false, stacked: false });
	}

	return (
		<>
			{rendered.map(({ entry, open, stacked }) => (
				<ModalSurfaceContext.Provider
					key={entry.id}
					value={{
						nav: entry.id,
						open,
						stacked,
						onClose: () => window.history.back(),
						onClosed: () => handleClosed(entry.id),
					}}
				>
					<Suspense fallback={null}>
						<entry.Component />
					</Suspense>
				</ModalSurfaceContext.Provider>
			))}
		</>
	);
}
