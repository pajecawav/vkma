import { useRouterState } from "@tanstack/react-router";
import { ModalPage } from "@vkontakte/vkui";
import { type ComponentType, useEffect, useRef, useState } from "react";

/**
 * Modal choreography: exactly one modal is visible at a time.
 *
 * A modal is a child route of a panel; while matched, its ModalPage is
 * open. When the matched modal CHANGES (a chain step: Details → More), the
 * old modal closes WITH its animation first — the host keeps it mounted
 * with `open={false}` — and only after the exit completes does the new
 * modal mount open. Stacked open sheets (two at once) cannot happen.
 *
 * The exit budget defaults to the VKUI modal close animation length; a
 * rapid retarget mid-exit just retargets the choreography.
 */

export interface ModalEntry {
	/** Full route id of the modal route (e.g. `/item/$id/details`). */
	routeId: string;
	/** Modal id — also the VKUI `nav`. */
	id: string;
	Component: ComponentType;
}

export interface ModalsProps {
	entries: ModalEntry[];
	/** Close animation budget, ms. Default 420 (VKUI modal page exit). */
	exitDuration?: number;
}

interface ChoreographyState {
	/** the modal route that should be open right now */
	target: ModalEntry | null;
	/** the modal currently visible (open) or animating out */
	displayed: ModalEntry | null;
	displayedOpen: boolean;
}

const CLOSED: ChoreographyState = { target: null, displayed: null, displayedOpen: false };

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
		target === null ? CLOSED : { target, displayed: target, displayedOpen: true },
	);

	// choreograph target changes: close the displayed modal first, then open
	// the new one (spike 2 correction: never two open sheets at once)
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	useEffect(() => {
		setState(previous => {
			if (previous.target === target) {
				return previous;
			}
			if (timer.current !== null) {
				clearTimeout(timer.current);
				timer.current = null;
			}
			if (target === null) {
				// close everything
				if (previous.displayed === null) {
					return CLOSED;
				}
				timer.current = setTimeout(() => {
					timer.current = null;
					setState(CLOSED);
				}, exitDuration);
				return { target: null, displayed: previous.displayed, displayedOpen: false };
			}
			if (previous.displayed !== null && previous.displayedOpen) {
				// close the old sheet, then open the new one after the exit
				timer.current = setTimeout(() => {
					timer.current = null;
					setState({ target, displayed: target, displayedOpen: true });
				}, exitDuration);
				return { target, displayed: previous.displayed, displayedOpen: false };
			}
			// nothing visible — open immediately
			return { target, displayed: target, displayedOpen: true };
		});
	}, [target, exitDuration]);

	useEffect(
		() => () => {
			if (timer.current !== null) {
				clearTimeout(timer.current);
			}
		},
		[],
	);

	const ids = new Set<string>();
	if (state.displayed !== null) {
		ids.add(state.displayed.id);
	}
	if (state.target !== null && state.target !== state.displayed) {
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
					<ModalPage
						key={id}
						nav={entry.id}
						open={open}
						keepMounted
						onClose={() => window.history.back()}
					>
						<entry.Component />
					</ModalPage>
				);
			})}
		</>
	);
}
