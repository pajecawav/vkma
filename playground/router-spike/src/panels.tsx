import { Link, useRouterState } from "@tanstack/react-router";
import {
	Button,
	CellButton,
	Div,
	Group,
	Header,
	PanelHeader,
	PanelHeaderBack,
	Placeholder,
} from "@vkontakte/vkui";
import { useOpenGlobalModal } from "./modals";

/**
 * PROTOTYPE (spikes 1–2) panels. Every panel renders the CURRENT router
 * location as text so the "prev-data of the departing panel" question is
 * observable during the back animation (does the leaving panel flash with
 * the new location's data?).
 */

function LocationProbe({ label }: { label: string }) {
	const pathname = useRouterState({ select: s => s.location.pathname });
	const search = useRouterState({ select: s => s.location.searchStr });
	return (
		<div style={{ fontFamily: "monospace", fontSize: 13, opacity: 0.7 }}>
			<div>
				{label}: {pathname}
			</div>
			<div>search: {search || "—"}</div>
		</div>
	);
}

export function HomePanel() {
	const openGlobalModal = useOpenGlobalModal();
	return (
		<>
			<PanelHeader>Home</PanelHeader>
			<Group header={<Header>happy path & skip-one forward</Header>}>
				<CellButton>
					<Link to="/list">→ list (next, forward anim)</Link>
				</CellButton>
				<CellButton>
					<Link to="/item/$id" params={{ id: "7" }}>
						→ item 7 (skip-one forward)
					</Link>
				</CellButton>
				<CellButton>
					<Link to="/about">→ about</Link>
				</CellButton>
			</Group>
			<Group header={<Header>spike 2: overlays</Header>}>
				<Div>
					<Button size="l" stretched onClick={openGlobalModal}>
						open settings (?modal= global)
					</Button>
				</Div>
			</Group>
			<Group>
				<LocationProbe label="home@now" />
			</Group>
		</>
	);
}

export function ListPanel() {
	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => window.history.back()} />}>
				List
			</PanelHeader>
			<Group>
				<CellButton>
					<Link to="/item/$id" params={{ id: "7" }}>
						→ item 7 (forward anim)
					</Link>
				</CellButton>
				<CellButton>
					<Link to="/item/$id" params={{ id: "9" }} replace>
						⇄ item 9 (replace: same panel, no anim?)
					</Link>
				</CellButton>
			</Group>
			<Group>
				<LocationProbe label="list@now" />
			</Group>
		</>
	);
}

export function AboutPanel() {
	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => window.history.back()} />}>
				About
			</PanelHeader>
			<Group>
				<Placeholder>Static panel, nothing to see.</Placeholder>
			</Group>
		</>
	);
}
