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
import { idleChoreography, reconcile, type ChoreographyState } from "./choreography.ts";

/**
 * Modal choreography host. The state machine lives in `choreography.ts`
 * (pure — sibling closes first, nested stacks on top, back reveals the
 * parent, retarget-during-exit cancels or queues). This host binds it to
 * VKUI: exit completion is EVENT-DRIVEN — VKUI fires `onClosed` at the
 * transition end and backs it with an internal timer computed from the
 * element's real `transitionDuration` (adapts to platform/theme/reduced-
 * motion — more accurate than any host-side constant). The host
 * `exitDuration` is only a WATCHDOG for the one case VKUI cannot report:
 * the modal unmounting before the exit finishes (its entry vanished from
 * `entries`).
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

/**
 * The host-owned keys VKUI actually accepts. Everything else in the api
 * (`stacked` today, future host keys tomorrow) must NOT reach the spread —
 * VKUI forwards unknown props to the DOM and React warns on booleans
 * ("Received `false` for a non-boolean attribute `stacked`").
 */
export function hostProps(api: ModalSurfaceApi): {
	nav: string;
	open: boolean;
	onClose: () => void;
	onClosed: () => void;
} {
	const { nav, open, onClose, onClosed } = api;
	return { nav, open, onClose, onClosed };
}

/** ModalPage surface for a modal entry — the host owns nav/open/close choreography. */
export function ModalPageSurface({
	children,
	...surface
}: Omit<ModalPageProps, "nav" | "open" | "onClose" | "onClosed" | "keepMounted">) {
	const api = useModalSurface();
	return (
		<ModalPage
			{...hostProps(api)}
			keepMounted
			disableFocusTrap={api.stacked || undefined}
			{...surface}
		>
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
		<ModalCard
			{...hostProps(api)}
			keepMounted
			disableFocusTrap={api.stacked || undefined}
			{...surface}
		>
			{children}
		</ModalCard>
	);
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

	const [state, setState] = useState<ChoreographyState<ModalEntry>>(() =>
		reconcile(idleChoreography<ModalEntry>(), target),
	);

	// choreograph target changes (see reconcile)
	useEffect(() => {
		setState(previous => reconcile(previous, target));
	}, [target]);

	const handleClosed = (closedId: string): void => {
		setState(previous => {
			if (previous.awaitingExitId !== closedId) {
				return previous; // stale or unexpected callback
			}
			const settled: ChoreographyState<ModalEntry> = {
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
