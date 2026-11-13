import {
	createVkLink,
	Modals,
	NotFound,
	Popouts,
	useActiveStory,
	VkView,
	useInflate,
	type AppHandle,
} from "@vkma.dev/router/preset";
// Epic matches its children by the ELEMENT-level nav prop. VkView computes
// its default one level down, so shells must pass nav explicitly
import { storyKeyOf } from "@vkma.dev/router/vkui";
import {
	Icon28MoreHorizontal,
	Icon28NewsfeedOutline,
	Icon28UserCircleOutline,
} from "@vkontakte/icons";
import {
	Cell,
	Epic,
	Group,
	Panel,
	PanelHeader,
	SplitCol,
	SplitLayout,
	Tabbar,
	TabbarItem,
	useAdaptivityConditionalRender,
} from "@vkontakte/vkui";
import type { ComponentType } from "react";
import { feedPanel } from "./panels/feed/feed.panel";
import { morePanel } from "./panels/more/more.panel";
import { profilePanel } from "./panels/profile/profile.panel";

const CellLink = createVkLink(Cell);
const TabbarItemLink = createVkLink(TabbarItem);

interface TabConfig {
	id: string;
	label: string;
	// the typed hub handles: the tabs' links type-check their (empty)
	// params; a bare `{ path }` object would demand params explicitly
	page: typeof profilePanel | typeof feedPanel | typeof morePanel;
	Icon: ComponentType;
}

const TABS: TabConfig[] = [
	{ id: "profile", label: "Профиль", page: profilePanel, Icon: Icon28UserCircleOutline },
	{ id: "feed", label: "Лента", page: feedPanel, Icon: Icon28NewsfeedOutline },
	{ id: "more", label: "Ещё", page: morePanel, Icon: Icon28MoreHorizontal },
];

/**
 * The app shell, mirroring the VKUI navigation guide: SplitLayout with a
 * header stub, a sidebar of Cells on desktop, Epic + Tabbar on mobile,
 * driven by the ROUTER (no local activeStory state). Tabs navigate with
 * `replace`, so back never walks the tab bar.
 */
export function AppShell({ app }: { app: AppHandle }) {
	useInflate(app);
	const activeStory = useActiveStory(app);
	const { viewWidth } = useAdaptivityConditionalRender();

	if (activeStory === null) {
		// an unmatched URL must show the NotFound screen, falling back to
		// the first story would spin forever on a lazy panel that never loads
		return <NotFound />;
	}

	return (
		<>
			<SplitLayout header={<PanelHeader delimiter="none" />}>
				{viewWidth.tabletPlus && (
					<SplitCol
						className={viewWidth.tabletPlus.className}
						width="280px"
						maxWidth="280px"
						fixed
					>
						<Panel>
							<PanelHeader />
							<Group>
								{TABS.map(({ id, label, page, Icon }) => (
									<CellLink
										key={id}
										before={<Icon />}
										activated={activeStory === id}
										page={page}
										replace
									>
										{label}
									</CellLink>
								))}
							</Group>
						</Panel>
					</SplitCol>
				)}
				<SplitCol maxWidth="560px" stretchedOnMobile autoSpaced>
					<Epic
						activeStory={activeStory}
						tabbar={
							viewWidth.tabletMinus && (
								<Tabbar className={viewWidth.tabletMinus.className}>
									{TABS.map(({ id, label, page, Icon }) => (
										<TabbarItemLink
											key={id}
											label={label}
											selected={activeStory === id}
											page={page}
											replace
										>
											<Icon />
										</TabbarItemLink>
									))}
								</Tabbar>
							)
						}
					>
						{Object.values(app.views).map(view => (
							<VkView key={view.id} view={view} nav={storyKeyOf(view.id)} />
						))}
					</Epic>
				</SplitCol>
			</SplitLayout>
			<Modals entries={app.modals} />
			<Popouts entries={app.popouts} />
		</>
	);
}
