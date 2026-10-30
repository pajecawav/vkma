import {
	Modals,
	NotFound,
	Popouts,
	useActiveStory,
	VkView,
	useInflate,
	useNavigator,
	type AppHandle,
} from "@vkma.dev/router/preset";
// Epic matches its children by the ELEMENT-level nav prop — VkView computes
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

interface TabConfig {
	id: string;
	label: string;
	to: "/" | "/feed" | "/more";
	Icon: ComponentType;
}

const TABS: TabConfig[] = [
	{ id: "profile", label: "Профиль", to: "/", Icon: Icon28UserCircleOutline },
	{ id: "feed", label: "Лента", to: "/feed", Icon: Icon28NewsfeedOutline },
	{ id: "more", label: "Ещё", to: "/more", Icon: Icon28MoreHorizontal },
];

/**
 * The active story comes from the exported `useActiveStory` — the owning
 * view of the deepest match (a modal child route resolves to its panel's
 * view), null on a notFound navigation: render the NotFound screen, never
 * a story fallback (an unmatched lazy panel's chunk never loads).
 */

/**
 * The app shell, mirroring the VKUI navigation guide: SplitLayout with a
 * header stub, a sidebar of Cells on desktop, Epic + Tabbar on mobile —
 * all of it driven by the ROUTER (no local activeStory state). Tabs
 * navigate with `replace`, so back never walks the tab bar.
 */
export function AppShell({ app }: { app: AppHandle }) {
	useInflate(app);
	const navigator = useNavigator();
	const activeStory = useActiveStory(app);
	const { viewWidth } = useAdaptivityConditionalRender();
	const onTab = (to: TabConfig["to"]) => {
		void navigator.replace({ to });
	};

	if (activeStory === null) {
		// an unmatched URL must show the NotFound screen — falling back to
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
								{TABS.map(({ id, label, to, Icon }) => (
									<Cell
										key={id}
										before={<Icon />}
										activated={activeStory === id}
										onClick={() => onTab(to)}
									>
										{label}
									</Cell>
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
									{TABS.map(({ id, label, to, Icon }) => (
										<TabbarItem
											key={id}
											label={label}
											selected={activeStory === id}
											onClick={() => onTab(to)}
										>
											<Icon />
										</TabbarItem>
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
