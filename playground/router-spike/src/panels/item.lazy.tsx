import { Link } from "@tanstack/react-router";
import { usePanelParams, usePanelSearch } from "@vkma.dev/router/react";
import { CellButton, Group, PanelHeader, PanelHeaderBack, Text, Title } from "@vkontakte/vkui";
import { app } from "../routes";

/**
 * PROTOTYPE — the lazy panel chunk (code-based splitting works without
 * file-based routing). Reads params/search through the package hooks with
 * the departing-panel freeze semantics.
 */

export const itemLazy = async (_routeId: string): Promise<{ component: typeof ItemPanel }> => ({
	component: ItemPanel,
});

function ItemPanel() {
	const { id = "?" } = usePanelParams(app.panels["main/item/$id"]!.routeId);
	const search = usePanelSearch<{ tab?: string }>(app.panels["main/item/$id"]!.routeId);
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
						◇ details (modal route)
					</Link>
				</CellButton>
				<CellButton>
					<Link to="/">→ home</Link>
				</CellButton>
			</Group>
		</>
	);
}
