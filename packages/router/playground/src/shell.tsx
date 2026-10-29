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
import {
	Icon28MessageOutline,
	Icon28MoreHorizontal,
	Icon28NewsfeedOutline,
	Icon28UserCircleOutline,
} from "@vkontakte/icons";
import {
	Cell,
	Counter,
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
import { chats } from "./data";
import { DebugOverlay } from "./debug";

/**
 * The showcase shell, mirroring the VKUI navigation guide: SplitLayout with
 * a header stub, a fixed sidebar of Cells on desktop, Epic + Tabbar on
 * mobile — all of it driven by the ROUTER (no local activeStory state).
 * Tabs navigate with `replace`, so back never walks the tab bar.
 */

interface TabConfig {
	id: string;
	label: string;
	to: "/" | "/feed" | "/messages" | "/more";
	Icon: ComponentType;
	badge?: number;
}

const unread = chats.reduce((sum, chat) => sum + chat.unread, 0);

const TABS: TabConfig[] = [
	{ id: "profile", label: "Профиль", to: "/", Icon: Icon28UserCircleOutline },
	{ id: "feed", label: "Лента", to: "/feed", Icon: Icon28NewsfeedOutline },
	{
		id: "messages",
		label: "Сообщения",
		to: "/messages",
		Icon: Icon28MessageOutline,
		badge: unread,
	},
	{ id: "more", label: "Ещё", to: "/more", Icon: Icon28MoreHorizontal },
];

/**
 * The active story comes from the exported `useActiveStory` — the owning
 * view of the deepest match, null on a notFound navigation (the package
 * owns the TanStack notFound-match sniffing, not every shell).
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
		// an unmatched URL must show the NotFound screen — falling back to the
		// first story here renders its lazy panel as an eternal spinner (the
		// chunk of an unmatched route is never fetched)
		return (
			<>
				<NotFound />
				<DebugOverlay />
			</>
		);
	}

	return (
		<>
			<SplitLayout header={<PanelHeader delimiter="none" />} center>
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
								{TABS.map(({ id, label, to, Icon, badge }) => (
									<Cell
										key={id}
										before={<Icon />}
										activated={activeStory === id}
										onClick={() => onTab(to)}
										indicator={
											badge !== undefined && activeStory !== id ? (
												<Counter
													size="s"
													mode="primary"
													appearance="accent-red"
												>
													{badge}
												</Counter>
											) : null
										}
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
									{TABS.map(({ id, label, to, Icon, badge }) => (
										<TabbarItem
											key={id}
											label={label}
											selected={activeStory === id}
											indicator={
												badge !== undefined && activeStory !== id ? (
													<Counter
														size="s"
														mode="primary"
														appearance="accent-red"
													>
														{badge}
													</Counter>
												) : null
											}
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
							<VkView key={view.id} view={view} />
						))}
					</Epic>
				</SplitCol>
			</SplitLayout>
			<Modals entries={app.modals} />
			<Popouts entries={app.popouts} />
			<DebugOverlay />
		</>
	);
}
