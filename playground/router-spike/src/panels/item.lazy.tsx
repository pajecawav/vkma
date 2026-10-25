import { createLazyRoute, Link, useSearch } from "@tanstack/react-router";
import { CellButton, Group, PanelHeader, PanelHeaderBack, Text, Title } from "@vkontakte/vkui";
import { useLastWhileUndefined, usePanelParams } from "../VkuiView";

/**
 * PROTOTYPE (spikes 1, 2, 4) — the lazy panel chunk.
 * Loaded via `itemRoute.lazy()` in routes.tsx; proves code-based chunk
 * splitting works. Reads typed search (validateSearch) with the
 * departing-panel freeze semantics; spike 2 adds the modal entry point.
 */

export const itemLazy = createLazyRoute("/view-main/item/$id")({
	component: ItemPanel,
});

function ItemPanel() {
	const { id = "?" } = usePanelParams("/view-main/item/$id");
	const search = useLastWhileUndefined(
		useSearch({ from: "/view-main/item/$id", shouldThrow: false }) as
			| { tab?: string }
			| undefined,
	);
	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => window.history.back()} />}>
				Item
			</PanelHeader>
			<Group>
				<Title level="1" style={{ padding: 24, fontSize: 48 }}>
					ITEM {id}
				</Title>
				{search?.tab ? (
					<Text style={{ padding: "0 24px" }}>typed search tab: {search.tab}</Text>
				) : null}
				<CellButton>
					<Link to="/item/$id" params={{ id: String(Number(id) + 1) }}>
						→ item {Number(id) + 1} (same panel, new param)
					</Link>
				</CellButton>
				<CellButton>
					<Link to="/item/$id/details" params={{ id }}>
						◇ details (modal route, masked URL)
					</Link>
				</CellButton>
				<CellButton>
					<Link to="/">→ home (PUSH back-skip: VKUI animates BACK?)</Link>
				</CellButton>
			</Group>
		</>
	);
}
