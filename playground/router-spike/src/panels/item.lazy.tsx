import { createLazyRoute, Link } from "@tanstack/react-router";
import { CellButton, Group, PanelHeader, PanelHeaderBack, Title } from "@vkontakte/vkui";
import { usePanelParams } from "../VkuiView";

/**
 * PROTOTYPE (spike 1) — the lazy panel chunk.
 * Loaded via `itemRoute.lazy()` in routes.tsx; proves code-based chunk
 * splitting works and lets us observe how a pending panel renders inside
 * the static-children model.
 */

export const itemLazy = createLazyRoute("/view-main/item/$id")({
	component: ItemPanel,
});

function ItemPanel() {
	const { id } = usePanelParams("/view-main/item/$id");
	return (
		<>
			<PanelHeader before={<PanelHeaderBack onClick={() => window.history.back()} />}>
				Item
			</PanelHeader>
			<Group>
				<Title level="1" style={{ padding: 24, fontSize: 48 }}>
					ITEM {id}
				</Title>
				<CellButton>
					<Link to="/item/$id" params={{ id: String(Number(id) + 1) }}>
						→ item {Number(id) + 1} (same panel, new param)
					</Link>
				</CellButton>
				<CellButton>
					<Link to="/">→ home (PUSH back-skip: VKUI animates BACK?)</Link>
				</CellButton>
			</Group>
		</>
	);
}
