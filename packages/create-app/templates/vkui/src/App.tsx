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
import { useState } from "react";
import type { ComponentType } from "react";
import { FeedView } from "./views/FeedView";
import { MoreView } from "./views/MoreView";
import { ProfileView } from "./views/ProfileView";

interface TabConfig {
	id: string;
	label: string;
	Icon: ComponentType;
}

const TABS: TabConfig[] = [
	{ id: "profile", label: "Профиль", Icon: Icon28UserCircleOutline },
	{ id: "feed", label: "Лента", Icon: Icon28NewsfeedOutline },
	{ id: "more", label: "Ещё", Icon: Icon28MoreHorizontal },
];

/**
 * The app shell, following the VKUI navigation guide: SplitLayout with a
 * header stub, a sidebar of Cells on desktop and Epic + Tabbar on mobile.
 * Navigation lives in local state here. See the router preset for the
 * URL-driven version of the same structure.
 */
export function App() {
	const [activeStory, setActiveStory] = useState("profile");
	const { viewWidth } = useAdaptivityConditionalRender();

	return (
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
							{TABS.map(({ id, label, Icon }) => (
								<Cell
									key={id}
									before={<Icon />}
									activated={activeStory === id}
									onClick={() => setActiveStory(id)}
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
								{TABS.map(({ id, label, Icon }) => (
									<TabbarItem
										key={id}
										label={label}
										selected={activeStory === id}
										onClick={() => setActiveStory(id)}
									>
										<Icon />
									</TabbarItem>
								))}
							</Tabbar>
						)
					}
				>
					<ProfileView id="profile" />
					<FeedView id="feed" />
					<MoreView id="more" />
				</Epic>
			</SplitCol>
		</SplitLayout>
	);
}
