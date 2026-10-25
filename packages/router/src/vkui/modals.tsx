import { useRouterState } from "@tanstack/react-router";
import { ModalCard, ModalPage } from "@vkontakte/vkui";
import { type ComponentType, type ReactNode, Suspense, useEffect, useState } from "react";

/**
 * Modal choreography: exactly one modal is visible at a time.
 *
 * A modal is a child route of a panel; while matched, its surface (a
 * ModalPage or a ModalCard) is open. When the matched modal CHANGES (a chain
 * step: Comments → Thread, or a page → card retarget), the old modal closes
 * WITH its animation first — the host keeps it mounted with `open={false}` —
 * and only after the exit completes does the new modal open. Stacked open
 * sheets (two at once) cannot happen.
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

export type ModalKind = "page" | "card";

/** Static chrome for `kind: "card"` entries — props of the ModalCard surface. */
export interface ModalCardOptions {
	icon?: ReactNode;
	title?: ReactNode;
	description?: ReactNode;
	actions?: ReactNode;
}

export interface ModalEntry {
	/** Full route id of the modal route (e.g. `/item/$id/details`). */
	routeId: string;
	/** Modal id — also the VKUI `nav`. */
	id: string;
	Component: ComponentType;
	/** Which VKUI surface hosts the content. Default: `"page"`. */
	kind?: ModalKind;
	/** ModalCard chrome — only read when `kind: "card"`. */
	card?: ModalCardOptions;
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

interface SurfaceProps {
	nav: string;
	open: boolean;
	keepMounted: boolean;
	onClose: () => void;
	onClosed: () => void;
}

/** The VKUI surface for an entry: a full-height page or a centered card. */
function ModalSurface({
	kind,
	card,
	children,
	...surface
}: SurfaceProps & { kind: ModalKind; card?: ModalCardOptions; children: ReactNode }) {
	if (kind === "card") {
		return (
			<ModalCard {...surface} {...card}>
				{children}
			</ModalCard>
		);
	}
	return <ModalPage {...surface}>{children}</ModalPage>;
}

interface ChoreographyState {
	/** the modal route that should be open right now */
	target: ModalEntry | null;
	/** the modal currently visible (open) or animating out */
	displayed: ModalEntry | null;
	displayedOpen: boolean;
	/** waiting for `displayed`'s exit animation to report `onClosed` */
	awaitingExit: boolean;
}

const CLOSED: ChoreographyState = {
	target: null,
	displayed: null,
	displayedOpen: false,
	awaitingExit: false,
};

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

	const [state, setState] = useState<ChoreographyState>(() =>
		target === null
			? CLOSED
			: { target, displayed: target, displayedOpen: true, awaitingExit: false },
	);

	// choreograph target changes: the visible sheet closes first and the new
	// one opens only after its exit completes (never two open sheets at once)
	useEffect(() => {
		setState(previous => {
			if (previous.target === target) {
				return previous;
			}
			if (target === null) {
				// close everything; the exit reports through onClosed (or the
				// watchdog) and the displayed modal unmounts
				return previous.displayed === null
					? CLOSED
					: {
							target: null,
							displayed: previous.displayed,
							displayedOpen: false,
							awaitingExit: true,
						};
			}
			// target IS the displayed sheet: cancel a running exit (VKUI
			// reverses the transition mid-flight — no close-open bounce)
			if (previous.displayed !== null && previous.displayed.id === target.id) {
				return {
					target,
					displayed: previous.displayed,
					displayedOpen: true,
					awaitingExit: false,
				};
			}
			if (previous.displayed === null) {
				// nothing mounted — open immediately
				return { target, displayed: target, displayedOpen: true, awaitingExit: false };
			}
			// a sheet is visible or already exiting: its exit gates the target
			return {
				target,
				displayed: previous.displayed,
				displayedOpen: false,
				awaitingExit: true,
			};
		});
	}, [target]);

	const handleClosed = (closedId: string): void => {
		setState(previous => {
			if (!previous.awaitingExit || previous.displayed?.id !== closedId) {
				return previous; // stale or unexpected callback
			}
			return previous.target === null
				? CLOSED
				: {
						target: previous.target,
						displayed: previous.target,
						displayedOpen: true,
						awaitingExit: false,
					};
		});
	};

	// watchdog for the lost-onClosed case (unmount mid-exit); the dep set
	// re-arms it on every new exit and cleans up on completion/unmount
	useEffect(() => {
		if (!state.awaitingExit) {
			return;
		}
		const watchdog = setTimeout(
			() => handleClosed(state.displayed?.id ?? ""),
			exitDuration * 2,
		);
		return () => clearTimeout(watchdog);
	}, [state.awaitingExit, state.displayed, exitDuration]);

	const ids = new Set<string>();
	if (state.displayed !== null) {
		ids.add(state.displayed.id);
	}
	if (state.target !== null && state.target.id !== state.displayed?.id) {
		ids.add(state.target.id);
	}

	return (
		<>
			{[...ids].map(id => {
				const entry = entries.find(candidate => candidate.id === id);
				if (!entry) {
					return null;
				}
				const isDisplayed = state.displayed?.id === id;
				const open = isDisplayed && state.displayedOpen;
				return (
					<ModalSurface
						key={id}
						kind={entry.kind ?? "page"}
						card={entry.card}
						nav={entry.id}
						open={open}
						keepMounted
						onClose={() => window.history.back()}
						onClosed={() => handleClosed(id)}
					>
						<Suspense fallback={null}>
							<entry.Component />
						</Suspense>
					</ModalSurface>
				);
			})}
		</>
	);
}
