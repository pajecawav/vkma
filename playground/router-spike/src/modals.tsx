import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Button, Div, ModalPage, ModalPageHeader, PanelHeaderClose, Text } from "@vkontakte/vkui";
import { type ComponentType, type ReactNode, createContext, useContext, useRef } from "react";
import { usePanelParams } from "./VkuiView";

/**
 * PROTOTYPE (spike 2) — the modal half of the /vkui layer.
 *
 * Mechanism under test:
 * - a modal is a child route of a panel; while matched, its ModalPage gets
 *   `open` (controlled standalone mode, no ModalRoot);
 * - the host keeps every seen modal mounted so the CLOSING animation can
 *   play after the route stops matching (`keepMounted` semantics);
 * - `onClose` = history.back() — the overlay entry pops;
 * - global modal = root search param (?modal=) read by the host (the real
 *   layer will use a pathless root route; the mechanics under test are the
 *   same: URL carries it, back closes it).
 */

const ModalOpenContext = createContext(false);

/** Wrapper modal route components render instead of raw <ModalPage>. */
export function RouteModal({ nav, children }: { nav: string; children: ReactNode }) {
	const open = useContext(ModalOpenContext);
	return (
		<ModalPage nav={nav} open={open} keepMounted onClose={() => window.history.back()}>
			{children}
		</ModalPage>
	);
}

interface ModalEntry {
	routeId: string;
	id: string;
	Component: ComponentType;
}

/** The registry stands in for the preset's generated id → component map. */
export function Modals({ entries }: { entries: ModalEntry[] }) {
	const snapshot = useRouterState({
		select: state => ({
			matched: new Set(
				state.matches
					.map(match => entries.find(entry => entry.routeId === match.routeId)?.id)
					.filter((id): id is string => id !== undefined),
			),
			globalModal: (state.location.search as { modal?: string } | undefined)?.modal ?? null,
		}),
	});

	// keep every seen modal mounted so the closing animation can play
	const seenRef = useRef<Set<string>>(new Set());
	for (const id of snapshot.matched) {
		seenRef.current.add(id);
	}

	const globalSeen = useRef<string | null>(null);
	if (snapshot.globalModal !== null) {
		globalSeen.current = snapshot.globalModal;
	}

	return (
		<>
			{[...seenRef.current].map(id => {
				const entry = entries.find(candidate => candidate.id === id);
				if (!entry) {
					return null;
				}
				return (
					<ModalOpenContext.Provider key={id} value={snapshot.matched.has(id)}>
						<entry.Component />
					</ModalOpenContext.Provider>
				);
			})}
			{globalSeen.current === "settings" ? (
				<ModalOpenContext.Provider value={snapshot.globalModal === "settings"}>
					<SettingsModal />
				</ModalOpenContext.Provider>
			) : null}
		</>
	);
}

// --- modal contents ---

function DetailsModal() {
	const { id = "?" } = usePanelParams("/view-main/item/$id");
	const navigate = useNavigate();
	return (
		<RouteModal nav="details">
			<ModalPageHeader before={<PanelHeaderClose onClick={() => window.history.back()} />}>
				Details
			</ModalPageHeader>
			<Div>
				<Text>details for item {id}</Text>
				<Button
					size="l"
					style={{ marginTop: 12 }}
					stretched
					onClick={() =>
						void navigate({
							to: "/item/$id/details/more",
							search: {},
							params: { id },
						})
					}
				>
					open more (modal on modal)
				</Button>
			</Div>
		</RouteModal>
	);
}

function MoreModal() {
	return (
		<RouteModal nav="more">
			<ModalPageHeader before={<PanelHeaderClose onClick={() => window.history.back()} />}>
				More
			</ModalPageHeader>
			<Div>
				<Text>second-level modal: back must return to Details</Text>
			</Div>
		</RouteModal>
	);
}

function SettingsModal() {
	return (
		<RouteModal nav="settings">
			<ModalPageHeader before={<PanelHeaderClose onClick={() => window.history.back()} />}>
				Settings
			</ModalPageHeader>
			<Div>
				<Text>global modal via ?modal=settings — opened from any panel</Text>
			</Div>
		</RouteModal>
	);
}

export const modalEntries: ModalEntry[] = [
	{ routeId: "/view-main/item/$id/details", id: "details", Component: DetailsModal },
	{ routeId: "/view-main/item/$id/details/more", id: "more", Component: MoreModal },
];

/** Open helper used by the home panel (spike stand-in for the global route). */
export function useOpenGlobalModal() {
	const navigate = useNavigate();
	return () =>
		void navigate({
			to: "/",
			search: previous => ({ ...previous, modal: "settings" }),
		});
}
