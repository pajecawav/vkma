import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useNavigator } from "@vkma.dev/router/preset";
import { usePanelLoaderData } from "@vkma.dev/router/react";
import {
	Button,
	CellButton,
	Group,
	Header,
	PanelHeader,
	PanelHeaderBack,
	Placeholder,
	ScreenSpinner,
} from "@vkontakte/vkui";
import { app } from "./routes";

/**
 * PROTOTYPE panels on top of @vkma.dev/router. Every panel renders the
 * CURRENT router location as text (the departing-panel probe from spike 1).
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
	const router = useRouter();
	const openGlobalModal = () => {
		const { pathname, searchStr, hash } = router.state.location;
		const params = new URLSearchParams(searchStr.replace(/^\?/, ""));
		params.set("modal", "settings");
		void router.navigate({ href: `${pathname}?${params.toString()}${hash}` });
	};
	return (
		<>
			<PanelHeader>Home</PanelHeader>
			<Group header={<Header>panels</Header>}>
				<CellButton>
					<Link to="/list">→ list</Link>
				</CellButton>
				<CellButton>
					<Link to="/item/$id" params={{ id: "7" }}>
						→ item 7 (lazy panel)
					</Link>
				</CellButton>
				<CellButton>
					<Link to="/feed">⟳ feed (loader + pending)</Link>
				</CellButton>
				<CellButton>
					<Link to="/about">→ about</Link>
				</CellButton>
			</Group>
			<Group header={<Header>overlays & TanStack passthrough</Header>}>
				<Div01>
					<Button size="l" stretched onClick={openGlobalModal}>
						settings (?modal= global)
					</Button>
				</Div01>
				<CellButton>
					<Link to="/item/$id" params={{ id: "7" }} search={{ tab: "reviews" }}>
						? item 7 with ?tab=reviews (typed search)
					</Link>
				</CellButton>
				<CellButton>
					<Link to="/item/$id" params={{ id: "666" }}>
						🚫 item 666 (beforeLoad → redirect home)
					</Link>
				</CellButton>
			</Group>
			<Group>
				<LocationProbe label="home@now" />
			</Group>
		</>
	);
}

/** VKUI Div is deprecated — a local Box stand-in for the spike. */
function Div01({ children }: { children: React.ReactNode }) {
	return <div style={{ padding: 12 }}>{children}</div>;
}

export function ListPanel() {
	const navigator = useNavigator();
	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
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
						⇄ item 9 (replace: same panel)
					</Link>
				</CellButton>
			</Group>
			<Group>
				<LocationProbe label="list@now" />
			</Group>
		</>
	);
}

export function FeedPanel() {
	const data = usePanelLoaderData<{ items: string[] }>(app.panels["main/feed"]!.routeId);
	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => window.history.back()} />}>
				Feed
			</PanelHeader>
			<Group>
				{data ? (
					<Placeholder>loaded: {data.items.join(", ")}</Placeholder>
				) : (
					<Placeholder>no loader data</Placeholder>
				)}
			</Group>
		</>
	);
}

export function FeedPending() {
	return (
		<div style={{ height: "100vh" }}>
			<ScreenSpinner />
		</div>
	);
}

export function AboutPanel() {
	const navigator = useNavigator();
	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => navigator.back()} />}>
				About
			</PanelHeader>
			<Group header={<Header>popout (back closes it)</Header>}>
				<Button size="l" stretched onClick={() => navigator.showPopout("confirm")}>
					show popout (Alert)
				</Button>
			</Group>
			<Group>
				<LocationProbe label="about@now" />
			</Group>
		</>
	);
}
